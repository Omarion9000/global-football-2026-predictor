import { describe, expect, it } from 'vitest';
import { PostgresPredictionRepository } from '../postgresPredictionRepository';
import { DuplicatePredictionRunError } from '../errors';
import type {
  PredictionRepository,
  PredictionRunInsert,
  PredictionRunRow,
  PredictionScorelineInsert,
  PredictionScorelineRow,
} from '../../';
import type { SqlClient } from '../../../postgres/serverClient';
import { makeMockSql } from './_mockSql';

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

const SCORELINE_ROW: PredictionScorelineRow = {
  id: 'score-001',
  prediction_run_id: 'run-001',
  team_a_goals: 2,
  team_b_goals: 1,
  probability: 0.12,
  rank: 1,
  created_at: '2026-06-11T17:00:02Z',
};

const SCORELINE_INSERT: PredictionScorelineInsert = {
  prediction_run_id: 'run-001',
  team_a_goals: 2,
  team_b_goals: 1,
  probability: 0.12,
  rank: 1,
};

describe('PostgresPredictionRepository — interface shape', () => {
  it('satisfies PredictionRepository structurally', () => {
    const sql = makeMockSql();
    const repo: PredictionRepository = new PostgresPredictionRepository(
      sql as unknown as SqlClient,
    );
    expect(typeof repo.insertPredictionRun).toBe('function');
    expect(typeof repo.insertPredictionScorelines).toBe('function');
    expect(typeof repo.getPredictionRunById).toBe('function');
    expect(typeof repo.getLatestPredictionForFixture).toBe('function');
    expect(typeof repo.listPredictionHistoryForFixture).toBe('function');
    expect(typeof repo.listScorelinesForRun).toBe('function');
  });

  it('has no update / patch / delete / modify / overwrite methods on the prototype', () => {
    const sql = makeMockSql();
    const repo = new PostgresPredictionRepository(sql as unknown as SqlClient);
    const methods = Object.getOwnPropertyNames(
      Object.getPrototypeOf(repo),
    ).filter((n) => n !== 'constructor');
    for (const name of methods) {
      expect(name.toLowerCase()).not.toMatch(
        /update|patch|modify|delete|overwrite/,
      );
    }
  });
});

describe('PostgresPredictionRepository — insertPredictionRun', () => {
  it('executes INSERT INTO prediction_runs and returns the row', async () => {
    const sql = makeMockSql();
    sql.enqueue([RUN_ROW]);
    const repo = new PostgresPredictionRepository(sql as unknown as SqlClient);

    const result = await repo.insertPredictionRun(RUN_INSERT);
    expect(result).toEqual(RUN_ROW);
    expect(sql.calls).toHaveLength(1);
    expect(sql.calls[0].query).toMatch(/INSERT INTO prediction_runs/i);
    expect(sql.calls[0].query).toMatch(/RETURNING \*/);
    expect(sql.calls[0].values).toContain(RUN_INSERT.fixture_id);
    expect(sql.calls[0].values).toContain(RUN_INSERT.run_type);
    expect(sql.calls[0].values).toContain(RUN_INSERT.model_version);
    expect(sql.calls[0].values).toContain(RUN_INSERT.team_a_win_probability);
  });

  it('maps PG 23505 unique-violation to DuplicatePredictionRunError', async () => {
    const sql = makeMockSql();
    sql.enqueueError({
      code: '23505',
      message:
        'duplicate key value violates unique constraint "prediction_runs_idempotency"',
    });
    const repo = new PostgresPredictionRepository(sql as unknown as SqlClient);
    await expect(repo.insertPredictionRun(RUN_INSERT)).rejects.toBeInstanceOf(
      DuplicatePredictionRunError,
    );
  });

  it('also maps a unique-violation nested under err.cause', async () => {
    const sql = makeMockSql();
    const err = new Error('insert failed');
    (err as { cause?: { code?: string } }).cause = { code: '23505' };
    sql.queue.push({ kind: 'error', error: err });
    const repo = new PostgresPredictionRepository(sql as unknown as SqlClient);
    await expect(repo.insertPredictionRun(RUN_INSERT)).rejects.toBeInstanceOf(
      DuplicatePredictionRunError,
    );
  });

  it('wraps non-duplicate errors in a generic Error', async () => {
    const sql = makeMockSql();
    sql.enqueueError({
      code: '42P01',
      message: 'relation "prediction_runs" does not exist',
    });
    const repo = new PostgresPredictionRepository(sql as unknown as SqlClient);
    await expect(repo.insertPredictionRun(RUN_INSERT)).rejects.toThrow(
      /insertPredictionRun:.*relation "prediction_runs" does not exist/,
    );
  });

  it('serialises warnings as JSON for jsonb', async () => {
    const sql = makeMockSql();
    sql.enqueue([{ ...RUN_ROW, warnings: ['note A'] }]);
    const repo = new PostgresPredictionRepository(sql as unknown as SqlClient);
    await repo.insertPredictionRun({ ...RUN_INSERT, warnings: ['note A'] });
    // The warnings should appear as a serialised JSON string among the values
    expect(sql.calls[0].values).toContain(JSON.stringify(['note A']));
    expect(sql.calls[0].query).toMatch(/::jsonb/);
  });
});

describe('PostgresPredictionRepository — insertPredictionScorelines', () => {
  it('inserts each scoreline against prediction_scorelines', async () => {
    const sql = makeMockSql();
    sql.enqueue([SCORELINE_ROW]);
    sql.enqueue([{ ...SCORELINE_ROW, id: 'score-002', team_a_goals: 1, team_b_goals: 1, rank: 2 }]);
    const repo = new PostgresPredictionRepository(sql as unknown as SqlClient);

    const out = await repo.insertPredictionScorelines([
      SCORELINE_INSERT,
      { ...SCORELINE_INSERT, team_a_goals: 1, team_b_goals: 1, rank: 2 },
    ]);
    expect(out).toHaveLength(2);
    expect(sql.calls).toHaveLength(2);
    for (const call of sql.calls) {
      expect(call.query).toMatch(/INSERT INTO prediction_scorelines/i);
      expect(call.query).toMatch(/RETURNING \*/);
    }
  });

  it('short-circuits on empty input', async () => {
    const sql = makeMockSql();
    const repo = new PostgresPredictionRepository(sql as unknown as SqlClient);
    const out = await repo.insertPredictionScorelines([]);
    expect(out).toEqual([]);
    expect(sql.calls).toHaveLength(0);
  });
});

describe('PostgresPredictionRepository — reads', () => {
  it('getPredictionRunById queries prediction_runs by id', async () => {
    const sql = makeMockSql();
    sql.enqueue([RUN_ROW]);
    const repo = new PostgresPredictionRepository(sql as unknown as SqlClient);
    const out = await repo.getPredictionRunById('run-001');
    expect(out).toEqual(RUN_ROW);
    expect(sql.calls[0].query).toMatch(/SELECT \* FROM prediction_runs/i);
    expect(sql.calls[0].query).toMatch(/WHERE id = \?/);
    expect(sql.calls[0].values).toEqual(['run-001']);
  });

  it('returns null when no row matches', async () => {
    const sql = makeMockSql();
    sql.enqueue([]);
    const repo = new PostgresPredictionRepository(sql as unknown as SqlClient);
    expect(await repo.getPredictionRunById('nope')).toBeNull();
  });

  it('getLatestPredictionForFixture orders DESC by executed_at and limits 1', async () => {
    const sql = makeMockSql();
    sql.enqueue([RUN_ROW]);
    const repo = new PostgresPredictionRepository(sql as unknown as SqlClient);
    await repo.getLatestPredictionForFixture('fixture-001', 'T_MINUS_3H');
    const q = sql.calls[0].query;
    expect(q).toMatch(/WHERE fixture_id = \?/);
    expect(q).toMatch(/run_type = \?/);
    expect(q).toMatch(/ORDER BY executed_at DESC/i);
    expect(q).toMatch(/LIMIT 1/i);
    expect(sql.calls[0].values).toEqual(['fixture-001', 'T_MINUS_3H']);
  });

  it('listPredictionHistoryForFixture orders ASC by executed_at', async () => {
    const sql = makeMockSql();
    sql.enqueue([RUN_ROW]);
    const repo = new PostgresPredictionRepository(sql as unknown as SqlClient);
    const out = await repo.listPredictionHistoryForFixture('fixture-001');
    expect(out).toEqual([RUN_ROW]);
    expect(sql.calls[0].query).toMatch(/ORDER BY executed_at ASC/i);
  });

  it('listScorelinesForRun orders ASC by rank', async () => {
    const sql = makeMockSql();
    sql.enqueue([SCORELINE_ROW]);
    const repo = new PostgresPredictionRepository(sql as unknown as SqlClient);
    const out = await repo.listScorelinesForRun('run-001');
    expect(out).toEqual([SCORELINE_ROW]);
    expect(sql.calls[0].query).toMatch(/FROM prediction_scorelines/i);
    expect(sql.calls[0].query).toMatch(/ORDER BY rank ASC/i);
  });
});

describe('PostgresPredictionRepository — source-level safeguards', () => {
  it('imports "server-only" and uses no NEXT_PUBLIC_ prefix', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const url = await import('node:url');
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const src = fs.readFileSync(
      path.resolve(here, '../postgresPredictionRepository.ts'),
      'utf-8',
    );
    expect(src).toMatch(/^import 'server-only'/m);
    expect(src).not.toMatch(/NEXT_PUBLIC_/);
  });
});
