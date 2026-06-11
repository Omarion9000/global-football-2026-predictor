import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InMemoryPredictionRepository } from '@/lib/data';
import { MODEL_VERSION } from '@/lib/model';
import type {
  PredictionRepository,
} from '@/lib/data/persistence/predictionRepository';
import type {
  PredictionRunInsert,
  PredictionRunRow,
  PredictionScorelineRow,
} from '@/lib/data/persistence/types';
import {
  loadMostRecentPredictionForFixture,
  loadPredictionHistoryForFixture,
} from '../uiReadModel';
import { getDemoFixtures } from '../demoPredictions';

// Use a fixture that exists in the mock catalog so the demo-fallback path has
// something to return. fixture-001 has a full Phase 6 demo history of three
// runs (T_MINUS_3H, T_MINUS_1H, T_ZERO).
const DEMO_FIXTURE_ID = getDemoFixtures()[0].id;

// =============================================================================
// Fixtures
// =============================================================================

function buildRunInsert(overrides: Partial<PredictionRunInsert>): PredictionRunInsert {
  return {
    fixture_id: DEMO_FIXTURE_ID,
    run_type: 'T_ZERO',
    model_version: MODEL_VERSION,
    scheduled_for: '2026-06-11T20:00:00.000Z',
    executed_at: '2026-06-11T20:00:05.000Z',
    data_snapshot_id: 'snap-injected',
    team_a_win_probability: 0.5,
    draw_probability: 0.3,
    team_b_win_probability: 0.2,
    team_a_expected_goals: 1.6,
    team_b_expected_goals: 0.9,
    confidence_score: 0.7,
    confidence_band: 'MEDIUM',
    warnings: [],
    ...overrides,
  };
}

function buildThrowingRepository(message = 'simulated read failure'): PredictionRepository {
  const throws = (): never => {
    throw new Error(message);
  };
  return {
    insertPredictionRun: throws,
    insertPredictionScorelines: throws,
    getPredictionRunById: throws,
    getLatestPredictionForFixture: throws,
    listPredictionHistoryForFixture: async () => {
      throw new Error(message);
    },
    listScorelinesForRun: throws,
  };
}

// =============================================================================
// DB populated → DB rows surface
// =============================================================================

describe('loadMostRecentPredictionForFixture — DB populated', () => {
  it('returns the persisted run + scorelines instead of the demo row', async () => {
    const repo = new InMemoryPredictionRepository();
    const run = await repo.insertPredictionRun(
      buildRunInsert({
        executed_at: '2026-06-11T22:00:00.000Z',
        data_snapshot_id: 'snap-db-populated',
      }),
    );
    await repo.insertPredictionScorelines([
      { prediction_run_id: run.id, team_a_goals: 1, team_b_goals: 1, probability: 0.18, rank: 2 },
      { prediction_run_id: run.id, team_a_goals: 2, team_b_goals: 0, probability: 0.21, rank: 1 },
      { prediction_run_id: run.id, team_a_goals: 0, team_b_goals: 1, probability: 0.09, rank: 3 },
    ]);

    const result = await loadMostRecentPredictionForFixture(DEMO_FIXTURE_ID, {
      predictionRepository: repo,
    });

    expect(result).not.toBeNull();
    expect(result!.run.id).toBe(run.id);
    expect(result!.run.data_snapshot_id).toBe('snap-db-populated');
    // Demo rows for fixture-001 use the `demo-run-NNNN` id pattern; assert we
    // are NOT serving those.
    expect(result!.run.id).not.toMatch(/^demo-run-/);
  });

  it('sorts scorelines by rank ASC, even if the repo returns them out of order', async () => {
    const repo = new InMemoryPredictionRepository();
    const run = await repo.insertPredictionRun(buildRunInsert({}));
    // Insert in non-rank order to verify the read model normalizes.
    await repo.insertPredictionScorelines([
      { prediction_run_id: run.id, team_a_goals: 0, team_b_goals: 1, probability: 0.10, rank: 4 },
      { prediction_run_id: run.id, team_a_goals: 2, team_b_goals: 1, probability: 0.22, rank: 1 },
      { prediction_run_id: run.id, team_a_goals: 1, team_b_goals: 1, probability: 0.14, rank: 3 },
      { prediction_run_id: run.id, team_a_goals: 1, team_b_goals: 0, probability: 0.18, rank: 2 },
    ]);

    const result = await loadMostRecentPredictionForFixture(DEMO_FIXTURE_ID, {
      predictionRepository: repo,
    });

    expect(result).not.toBeNull();
    const ranks = result!.scorelines.map((s) => s.rank);
    expect(ranks).toEqual([1, 2, 3, 4]);
  });

  it('picks MAX(executed_at) across all run types — not the latest insert', async () => {
    const repo = new InMemoryPredictionRepository();
    // Insert in order: T_MINUS_3H, T_ZERO (earliest), T_MINUS_1H (latest by time).
    // Last-inserted is T_MINUS_1H, but T_ZERO has the highest executed_at.
    await repo.insertPredictionRun(
      buildRunInsert({
        run_type: 'T_MINUS_3H',
        scheduled_for: '2026-06-11T17:00:00.000Z',
        executed_at: '2026-06-11T17:00:05.000Z',
      }),
    );
    const tZero = await repo.insertPredictionRun(
      buildRunInsert({
        run_type: 'T_ZERO',
        scheduled_for: '2026-06-11T20:00:00.000Z',
        executed_at: '2026-06-11T20:00:05.000Z',
      }),
    );
    await repo.insertPredictionRun(
      buildRunInsert({
        run_type: 'T_MINUS_1H',
        scheduled_for: '2026-06-11T19:00:00.000Z',
        executed_at: '2026-06-11T19:00:05.000Z',
      }),
    );

    const result = await loadMostRecentPredictionForFixture(DEMO_FIXTURE_ID, {
      predictionRepository: repo,
    });

    expect(result).not.toBeNull();
    expect(result!.run.id).toBe(tZero.id);
    expect(result!.run.run_type).toBe('T_ZERO');
  });
});

// =============================================================================
// DB empty → demo fallback
// =============================================================================

describe('loadMostRecentPredictionForFixture — DB empty', () => {
  it('falls back to the demo row for a fixture that exists in mock data', async () => {
    const repo = new InMemoryPredictionRepository();
    const result = await loadMostRecentPredictionForFixture(DEMO_FIXTURE_ID, {
      predictionRepository: repo,
    });
    expect(result).not.toBeNull();
    // Demo rows use `demo-run-NNNN` ids; the read model preserves them when
    // the DB has nothing.
    expect(result!.run.id).toMatch(/^demo-run-/);
    expect(result!.run.fixture_id).toBe(DEMO_FIXTURE_ID);
  });

  it('returns null when fixture is neither in DB nor in mock data', async () => {
    const repo = new InMemoryPredictionRepository();
    const result = await loadMostRecentPredictionForFixture(
      'fixture-does-not-exist-anywhere',
      { predictionRepository: repo },
    );
    expect(result).toBeNull();
  });
});

// =============================================================================
// DB throws → demo fallback, no console output
// =============================================================================

describe('loadMostRecentPredictionForFixture — DB throws', () => {
  let consoleSpies: ReturnType<typeof vi.spyOn>[] = [];

  beforeEach(() => {
    consoleSpies = [
      vi.spyOn(console, 'log').mockImplementation(() => undefined),
      vi.spyOn(console, 'warn').mockImplementation(() => undefined),
      vi.spyOn(console, 'error').mockImplementation(() => undefined),
      vi.spyOn(console, 'info').mockImplementation(() => undefined),
      vi.spyOn(console, 'debug').mockImplementation(() => undefined),
    ];
  });

  afterEach(() => {
    for (const spy of consoleSpies) spy.mockRestore();
  });

  it('returns the demo fallback when the repo throws', async () => {
    const repo = buildThrowingRepository('postgresql://hidden:redacted@host/db failed');
    const result = await loadMostRecentPredictionForFixture(DEMO_FIXTURE_ID, {
      predictionRepository: repo,
    });
    expect(result).not.toBeNull();
    expect(result!.run.id).toMatch(/^demo-run-/);
  });

  it('writes nothing to any console channel on the throw path', async () => {
    const repo = buildThrowingRepository('postgresql://user:secret@neon.tech/db');
    await loadMostRecentPredictionForFixture(DEMO_FIXTURE_ID, {
      predictionRepository: repo,
    });
    for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
  });

  it('does not rethrow when the repo error contains driver internals', async () => {
    const repo = buildThrowingRepository(
      'POSTGRES_URL=postgresql://x:y@example.neon.tech/db sslmode=require',
    );
    await expect(
      loadMostRecentPredictionForFixture(DEMO_FIXTURE_ID, {
        predictionRepository: repo,
      }),
    ).resolves.not.toBeNull();
  });
});

// =============================================================================
// History reader — same fallback contract
// =============================================================================

describe('loadPredictionHistoryForFixture', () => {
  it('returns persisted history when DB has rows', async () => {
    const repo = new InMemoryPredictionRepository();
    await repo.insertPredictionRun(buildRunInsert({ run_type: 'T_MINUS_3H', scheduled_for: '2026-06-11T17:00:00.000Z', executed_at: '2026-06-11T17:00:05.000Z' }));
    await repo.insertPredictionRun(buildRunInsert({ run_type: 'T_MINUS_1H', scheduled_for: '2026-06-11T19:00:00.000Z', executed_at: '2026-06-11T19:00:05.000Z' }));
    await repo.insertPredictionRun(buildRunInsert({ run_type: 'T_ZERO',     scheduled_for: '2026-06-11T20:00:00.000Z', executed_at: '2026-06-11T20:00:05.000Z' }));

    const history = await loadPredictionHistoryForFixture(DEMO_FIXTURE_ID, {
      predictionRepository: repo,
    });
    expect(history.length).toBe(3);
    // Demo rows have `demo-run-NNNN` ids; this is the DB path.
    expect(history.every((r) => !r.id.startsWith('demo-run-'))).toBe(true);
    // Repository contract is ASC by executed_at.
    const times = history.map((r) => r.executed_at);
    expect([...times]).toEqual([...times].sort());
  });

  it('falls back to the demo history when DB is empty', async () => {
    const repo = new InMemoryPredictionRepository();
    const history = await loadPredictionHistoryForFixture(DEMO_FIXTURE_ID, {
      predictionRepository: repo,
    });
    expect(history.length).toBeGreaterThan(0);
    expect(history.every((r) => r.id.startsWith('demo-run-'))).toBe(true);
  });

  it('falls back to demo when the repository throws', async () => {
    const repo = buildThrowingRepository('boom');
    const history = await loadPredictionHistoryForFixture(DEMO_FIXTURE_ID, {
      predictionRepository: repo,
    });
    expect(history.length).toBeGreaterThan(0);
    expect(history.every((r) => r.id.startsWith('demo-run-'))).toBe(true);
  });
});

// =============================================================================
// Source-level safeguards
// =============================================================================

describe('uiReadModel — source-level safeguards', () => {
  async function readSource(): Promise<string> {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const url = await import('node:url');
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    return fs.readFileSync(path.resolve(here, '../uiReadModel.ts'), 'utf-8');
  }

  it('imports server-only as a build-time backstop', async () => {
    const src = await readSource();
    expect(src).toMatch(/^import 'server-only'/m);
  });

  it('makes no NEXT_PUBLIC_ env references', async () => {
    const src = await readSource();
    expect(src).not.toMatch(/NEXT_PUBLIC_/);
  });

  it('issues no console writes — silent fallback only', async () => {
    const src = await readSource();
    expect(src).not.toMatch(/console\.\w+\(/);
  });

  it('never references DB env vars directly (uses the repository factory)', async () => {
    const src = await readSource();
    expect(src).not.toMatch(/POSTGRES_URL/);
    expect(src).not.toMatch(/SUPABASE_URL/);
    expect(src).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
  });
});
