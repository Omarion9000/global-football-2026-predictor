import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabasePredictionRepository } from '../supabasePredictionRepository';
import { DuplicatePredictionRunError } from '../errors';
import type {
  PredictionRepository,
  PredictionRunInsert,
  PredictionRunRow,
  PredictionScorelineInsert,
  PredictionScorelineRow,
} from '../../';
import { makeMockClient } from './_mockClient';

const RUN_ROW: PredictionRunRow = {
  id: 'run-001',
  fixture_id: 'fixture-001',
  run_type: 'T_MINUS_3H',
  model_version: 'v0.1.0',
  scheduled_for: '2026-06-11T17:00:00Z',
  executed_at: '2026-06-11T17:00:01Z',
  data_snapshot_id: 'snap-001',
  team_a_win_probability: 0.5,
  draw_probability: 0.3,
  team_b_win_probability: 0.2,
  team_a_expected_goals: 1.4,
  team_b_expected_goals: 0.9,
  confidence_score: 0.6,
  confidence_band: 'MEDIUM',
  warnings: [],
  created_at: '2026-06-11T17:00:01Z',
};

const RUN_INSERT: PredictionRunInsert = {
  fixture_id: 'fixture-001',
  run_type: 'T_MINUS_3H',
  model_version: 'v0.1.0',
  scheduled_for: '2026-06-11T17:00:00Z',
  executed_at: '2026-06-11T17:00:01Z',
  data_snapshot_id: 'snap-001',
  team_a_win_probability: 0.5,
  draw_probability: 0.3,
  team_b_win_probability: 0.2,
  team_a_expected_goals: 1.4,
  team_b_expected_goals: 0.9,
  confidence_score: 0.6,
  confidence_band: 'MEDIUM',
  warnings: [],
};

const SCORELINE_INSERT: PredictionScorelineInsert = {
  prediction_run_id: 'run-001',
  team_a_goals: 2,
  team_b_goals: 1,
  probability: 0.12,
  rank: 1,
};

describe('SupabasePredictionRepository — interface shape', () => {
  it('satisfies the PredictionRepository contract structurally', () => {
    const m = makeMockClient();
    const repo: PredictionRepository = new SupabasePredictionRepository(
      m.from as unknown as SupabaseClient extends { from: infer F } ? never : never extends never
        ? unknown
        : never,
    );
    // If TypeScript accepts the assignment to PredictionRepository above,
    // the shape is satisfied. Touch every method to prove the surface.
    expect(typeof repo.insertPredictionRun).toBe('function');
    expect(typeof repo.insertPredictionScorelines).toBe('function');
    expect(typeof repo.getPredictionRunById).toBe('function');
    expect(typeof repo.getLatestPredictionForFixture).toBe('function');
    expect(typeof repo.listPredictionHistoryForFixture).toBe('function');
    expect(typeof repo.listScorelinesForRun).toBe('function');
  });

  it('does not expose update / patch / delete methods on the prototype', () => {
    const m = makeMockClient();
    const repo = new SupabasePredictionRepository(
      m as unknown as SupabaseClient,
    );
    const methods = Object.getOwnPropertyNames(
      Object.getPrototypeOf(repo),
    ).filter((n) => n !== 'constructor');
    for (const name of methods) {
      expect(name.toLowerCase()).not.toMatch(/update|patch|modify|delete|overwrite/);
    }
  });
});

describe('SupabasePredictionRepository — insertPredictionRun', () => {
  it('calls from("prediction_runs").insert(row).select("*").single() and returns the row', async () => {
    const m = makeMockClient({
      prediction_runs: { data: RUN_ROW, error: null },
    });
    const repo = new SupabasePredictionRepository(m as unknown as SupabaseClient);
    const result = await repo.insertPredictionRun(RUN_INSERT);

    expect(result).toEqual(RUN_ROW);
    expect(m.from).toHaveBeenCalledWith('prediction_runs');
    const builder = m.builderForTable('prediction_runs');
    expect(builder?.insert).toHaveBeenCalledWith(RUN_INSERT);
    expect(builder?.select).toHaveBeenCalledWith('*');
    expect(builder?.single).toHaveBeenCalledTimes(1);
  });

  it('maps PG unique-violation (23505) to DuplicatePredictionRunError', async () => {
    const m = makeMockClient({
      prediction_runs: {
        data: null,
        error: { code: '23505', message: 'duplicate key value violates unique constraint' },
      },
    });
    const repo = new SupabasePredictionRepository(m as unknown as SupabaseClient);
    await expect(repo.insertPredictionRun(RUN_INSERT)).rejects.toBeInstanceOf(
      DuplicatePredictionRunError,
    );
  });

  it('wraps non-duplicate errors in a generic Error', async () => {
    const m = makeMockClient({
      prediction_runs: {
        data: null,
        error: { code: '42P01', message: 'relation "prediction_runs" does not exist' },
      },
    });
    const repo = new SupabasePredictionRepository(m as unknown as SupabaseClient);
    await expect(repo.insertPredictionRun(RUN_INSERT)).rejects.toThrow(
      /insertPredictionRun:.*relation "prediction_runs" does not exist/,
    );
  });
});

describe('SupabasePredictionRepository — insertPredictionScorelines', () => {
  it('uses the prediction_scorelines table', async () => {
    const m = makeMockClient({
      prediction_scorelines: { data: [{ ...SCORELINE_INSERT, id: 's-1', created_at: 't' }], error: null },
    });
    const repo = new SupabasePredictionRepository(m as unknown as SupabaseClient);
    const result = await repo.insertPredictionScorelines([SCORELINE_INSERT]);
    expect(result).toHaveLength(1);
    expect(m.from).toHaveBeenCalledWith('prediction_scorelines');
    const builder = m.builderForTable('prediction_scorelines');
    expect(builder?.insert).toHaveBeenCalledWith([SCORELINE_INSERT]);
  });

  it('short-circuits on empty input without calling the client', async () => {
    const m = makeMockClient({});
    const repo = new SupabasePredictionRepository(m as unknown as SupabaseClient);
    const result = await repo.insertPredictionScorelines([]);
    expect(result).toEqual([]);
    expect(m.from).not.toHaveBeenCalled();
  });
});

describe('SupabasePredictionRepository — reads', () => {
  it('getPredictionRunById queries by id with maybeSingle', async () => {
    const m = makeMockClient({
      prediction_runs: { data: RUN_ROW, error: null },
    });
    const repo = new SupabasePredictionRepository(m as unknown as SupabaseClient);
    const result = await repo.getPredictionRunById('run-001');
    expect(result).toEqual(RUN_ROW);
    const builder = m.builderForTable('prediction_runs');
    expect(builder?.select).toHaveBeenCalledWith('*');
    expect(builder?.eq).toHaveBeenCalledWith('id', 'run-001');
    expect(builder?.maybeSingle).toHaveBeenCalledTimes(1);
  });

  it('getLatestPredictionForFixture orders by executed_at desc and limits to 1', async () => {
    const m = makeMockClient({
      prediction_runs: { data: RUN_ROW, error: null },
    });
    const repo = new SupabasePredictionRepository(m as unknown as SupabaseClient);
    await repo.getLatestPredictionForFixture('fixture-001', 'T_MINUS_3H');
    const builder = m.builderForTable('prediction_runs');
    expect(builder?.eq).toHaveBeenCalledWith('fixture_id', 'fixture-001');
    expect(builder?.eq).toHaveBeenCalledWith('run_type', 'T_MINUS_3H');
    expect(builder?.order).toHaveBeenCalledWith('executed_at', { ascending: false });
    expect(builder?.limit).toHaveBeenCalledWith(1);
    expect(builder?.maybeSingle).toHaveBeenCalledTimes(1);
  });

  it('listPredictionHistoryForFixture orders by executed_at asc', async () => {
    const m = makeMockClient({
      prediction_runs: { data: [RUN_ROW], error: null },
    });
    const repo = new SupabasePredictionRepository(m as unknown as SupabaseClient);
    const rows = await repo.listPredictionHistoryForFixture('fixture-001');
    expect(rows).toEqual([RUN_ROW]);
    const builder = m.builderForTable('prediction_runs');
    expect(builder?.eq).toHaveBeenCalledWith('fixture_id', 'fixture-001');
    expect(builder?.order).toHaveBeenCalledWith('executed_at', { ascending: true });
  });

  it('listScorelinesForRun orders by rank asc', async () => {
    const m = makeMockClient({
      prediction_scorelines: { data: [], error: null },
    });
    const repo = new SupabasePredictionRepository(m as unknown as SupabaseClient);
    const rows = await repo.listScorelinesForRun('run-001');
    expect(rows).toEqual([]);
    const builder = m.builderForTable('prediction_scorelines');
    expect(builder?.eq).toHaveBeenCalledWith('prediction_run_id', 'run-001');
    expect(builder?.order).toHaveBeenCalledWith('rank', { ascending: true });
  });

  it('throws when Supabase returns an error during list', async () => {
    const m = makeMockClient({
      prediction_runs: {
        data: null,
        error: { code: '42501', message: 'permission denied for table prediction_runs' },
      },
    });
    const repo = new SupabasePredictionRepository(m as unknown as SupabaseClient);
    await expect(
      repo.listPredictionHistoryForFixture('fixture-001'),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('SupabasePredictionRepository — source-level safeguards', () => {
  it('source file imports "server-only"', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const url = await import('node:url');
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const src = fs.readFileSync(
      path.resolve(here, '../supabasePredictionRepository.ts'),
      'utf-8',
    );
    expect(src).toMatch(/^import 'server-only'/m);
    expect(src).not.toMatch(/NEXT_PUBLIC_/);
  });
});
