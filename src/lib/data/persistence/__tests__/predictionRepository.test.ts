import { describe, expect, it } from 'vitest';
import {
  DuplicatePredictionRunError,
  InMemoryPredictionRepository,
  type PredictionRepository,
  type PredictionRunInsert,
} from '../';

function baseInsert(
  overrides: Partial<PredictionRunInsert> = {},
): PredictionRunInsert {
  return {
    fixture_id: 'fixture-001',
    run_type: 'T_MINUS_3H',
    model_version: 'v0.1.0',
    scheduled_for: '2026-06-11T17:00:00Z',
    executed_at: '2026-06-11T17:00:03Z',
    data_snapshot_id: 'snap-1',
    team_a_win_probability: 0.55,
    draw_probability: 0.25,
    team_b_win_probability: 0.20,
    team_a_expected_goals: 1.8,
    team_b_expected_goals: 0.9,
    confidence_score: 0.6,
    confidence_band: 'MEDIUM',
    warnings: [],
    ...overrides,
  };
}

describe('PredictionRepository interface — no update methods (append-only contract)', () => {
  it('exposes only insert/get/list methods on InMemoryPredictionRepository', () => {
    const repo: PredictionRepository = new InMemoryPredictionRepository();
    const protoMethods = Object.getOwnPropertyNames(
      Object.getPrototypeOf(repo),
    ).filter((m) => m !== 'constructor');
    for (const m of protoMethods) {
      expect(m.toLowerCase()).not.toMatch(/update|patch|modify|delete/);
    }
  });
});

describe('InMemoryPredictionRepository', () => {
  it('inserts and reads back a prediction run', async () => {
    const repo = new InMemoryPredictionRepository();
    const row = await repo.insertPredictionRun(baseInsert());
    expect(row.id).toBeTruthy();
    const fetched = await repo.getPredictionRunById(row.id);
    expect(fetched?.fixture_id).toBe('fixture-001');
  });

  it('rejects duplicate inserts on (fixture_id, run_type, model_version, scheduled_for)', async () => {
    const repo = new InMemoryPredictionRepository();
    await repo.insertPredictionRun(baseInsert());
    await expect(repo.insertPredictionRun(baseInsert())).rejects.toBeInstanceOf(
      DuplicatePredictionRunError,
    );
  });

  it('allows distinct run_types for the same fixture and scheduled time', async () => {
    const repo = new InMemoryPredictionRepository();
    await repo.insertPredictionRun(baseInsert({ run_type: 'T_MINUS_3H' }));
    await repo.insertPredictionRun(baseInsert({ run_type: 'T_ZERO' }));
    await repo.insertPredictionRun(baseInsert({ run_type: 'HT' }));
    await repo.insertPredictionRun(baseInsert({ run_type: 'FT' }));
    const history = await repo.listPredictionHistoryForFixture('fixture-001');
    expect(history).toHaveLength(4);
  });

  it('refuses marginals that do not sum to ~1', async () => {
    const repo = new InMemoryPredictionRepository();
    await expect(
      repo.insertPredictionRun(
        baseInsert({
          team_a_win_probability: 0.9,
          draw_probability: 0.5,
          team_b_win_probability: 0.3,
        }),
      ),
    ).rejects.toThrow(/sum to 1/);
  });

  it('getLatestPredictionForFixture returns the latest by executed_at', async () => {
    const repo = new InMemoryPredictionRepository();
    await repo.insertPredictionRun(
      baseInsert({
        run_type: 'T_MINUS_3H',
        executed_at: '2026-06-11T17:00:00Z',
      }),
    );
    await repo.insertPredictionRun(
      baseInsert({
        run_type: 'T_MINUS_3H',
        scheduled_for: '2026-06-11T17:05:00Z',
        executed_at: '2026-06-11T17:05:00Z',
      }),
    );
    const latest = await repo.getLatestPredictionForFixture(
      'fixture-001',
      'T_MINUS_3H',
    );
    expect(latest?.executed_at).toBe('2026-06-11T17:05:00Z');
  });

  it('listPredictionHistoryForFixture returns runs ordered by executed_at asc', async () => {
    const repo = new InMemoryPredictionRepository();
    await repo.insertPredictionRun(
      baseInsert({
        run_type: 'HT',
        scheduled_for: '2026-06-11T21:00:00Z',
        executed_at: '2026-06-11T21:00:00Z',
      }),
    );
    await repo.insertPredictionRun(
      baseInsert({
        run_type: 'T_MINUS_3H',
        scheduled_for: '2026-06-11T17:00:00Z',
        executed_at: '2026-06-11T17:00:05Z',
      }),
    );
    const history = await repo.listPredictionHistoryForFixture('fixture-001');
    expect(history.map((r) => r.run_type)).toEqual(['T_MINUS_3H', 'HT']);
  });

  it('scorelines are inserted in bulk and round-trip with the parent run', async () => {
    const repo = new InMemoryPredictionRepository();
    const run = await repo.insertPredictionRun(baseInsert());
    await repo.insertPredictionScorelines([
      { prediction_run_id: run.id, team_a_goals: 2, team_b_goals: 1, probability: 0.12, rank: 1 },
      { prediction_run_id: run.id, team_a_goals: 1, team_b_goals: 0, probability: 0.10, rank: 2 },
    ]);
    const out = await repo.listScorelinesForRun(run.id);
    expect(out).toHaveLength(2);
    expect(out[0].rank).toBe(1);
  });
});
