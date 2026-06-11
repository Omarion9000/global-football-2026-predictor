import { describe, expect, it } from 'vitest';
import { PostgresSnapshotRepository } from '../postgresSnapshotRepository';
import type {
  DataSnapshotInsert,
  DataSnapshotRow,
  SnapshotRepository,
} from '../../';
import type { SqlClient } from '../../../postgres/serverClient';
import { makeMockSql } from './_mockSql';

const SNAPSHOT_ROW: DataSnapshotRow = {
  id: 'snap-001',
  fixture_id: 'fixture-001',
  captured_at: '2026-06-11T17:00:00Z',
  source_ids: ['mock'],
  input_hash: 'abc123',
  payload: null,
  created_at: '2026-06-11T17:00:01Z',
};

const SNAPSHOT_INSERT: DataSnapshotInsert = {
  id: 'snap-001',
  fixture_id: 'fixture-001',
  captured_at: '2026-06-11T17:00:00Z',
  source_ids: ['mock'],
  input_hash: 'abc123',
  payload: null,
};

describe('PostgresSnapshotRepository — interface shape', () => {
  it('satisfies SnapshotRepository structurally', () => {
    const sql = makeMockSql();
    const repo: SnapshotRepository = new PostgresSnapshotRepository(
      sql as unknown as SqlClient,
    );
    expect(typeof repo.insertSnapshot).toBe('function');
    expect(typeof repo.getSnapshotById).toBe('function');
    expect(typeof repo.listSnapshotsForFixture).toBe('function');
  });

  it('has no update / patch / delete methods on the prototype', () => {
    const sql = makeMockSql();
    const repo = new PostgresSnapshotRepository(sql as unknown as SqlClient);
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

describe('PostgresSnapshotRepository — insertSnapshot', () => {
  it('executes INSERT INTO data_snapshots and returns the row', async () => {
    const sql = makeMockSql();
    sql.enqueue([SNAPSHOT_ROW]);
    const repo = new PostgresSnapshotRepository(sql as unknown as SqlClient);

    const result = await repo.insertSnapshot(SNAPSHOT_INSERT);
    expect(result).toEqual(SNAPSHOT_ROW);
    expect(sql.calls[0].query).toMatch(/INSERT INTO data_snapshots/i);
    expect(sql.calls[0].query).toMatch(/RETURNING \*/);
    expect(sql.calls[0].values).toContain(SNAPSHOT_INSERT.id);
    expect(sql.calls[0].values).toContain(SNAPSHOT_INSERT.fixture_id);
    expect(sql.calls[0].values).toContain(SNAPSHOT_INSERT.input_hash);
  });

  it('serialises source_ids as JSON for jsonb', async () => {
    const sql = makeMockSql();
    sql.enqueue([SNAPSHOT_ROW]);
    const repo = new PostgresSnapshotRepository(sql as unknown as SqlClient);
    await repo.insertSnapshot({ ...SNAPSHOT_INSERT, source_ids: ['a', 'b'] });
    expect(sql.calls[0].values).toContain(JSON.stringify(['a', 'b']));
  });

  it('throws when no row is returned', async () => {
    const sql = makeMockSql();
    sql.enqueue([]);
    const repo = new PostgresSnapshotRepository(sql as unknown as SqlClient);
    await expect(repo.insertSnapshot(SNAPSHOT_INSERT)).rejects.toThrow(
      /no row returned/,
    );
  });
});

describe('PostgresSnapshotRepository — reads', () => {
  it('getSnapshotById queries data_snapshots by id', async () => {
    const sql = makeMockSql();
    sql.enqueue([SNAPSHOT_ROW]);
    const repo = new PostgresSnapshotRepository(sql as unknown as SqlClient);
    const out = await repo.getSnapshotById('snap-001');
    expect(out).toEqual(SNAPSHOT_ROW);
    expect(sql.calls[0].query).toMatch(/SELECT \* FROM data_snapshots/i);
    expect(sql.calls[0].query).toMatch(/WHERE id = \?/);
    expect(sql.calls[0].values).toEqual(['snap-001']);
  });

  it('listSnapshotsForFixture orders ASC by captured_at', async () => {
    const sql = makeMockSql();
    sql.enqueue([SNAPSHOT_ROW]);
    const repo = new PostgresSnapshotRepository(sql as unknown as SqlClient);
    const rows = await repo.listSnapshotsForFixture('fixture-001');
    expect(rows).toEqual([SNAPSHOT_ROW]);
    expect(sql.calls[0].query).toMatch(/WHERE fixture_id = \?/);
    expect(sql.calls[0].query).toMatch(/ORDER BY captured_at ASC/i);
  });

  it('returns null on no-row id', async () => {
    const sql = makeMockSql();
    sql.enqueue([]);
    const repo = new PostgresSnapshotRepository(sql as unknown as SqlClient);
    expect(await repo.getSnapshotById('nope')).toBeNull();
  });
});

describe('PostgresSnapshotRepository — source-level safeguards', () => {
  it('imports "server-only" and uses no NEXT_PUBLIC_ prefix', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const url = await import('node:url');
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const src = fs.readFileSync(
      path.resolve(here, '../postgresSnapshotRepository.ts'),
      'utf-8',
    );
    expect(src).toMatch(/^import 'server-only'/m);
    expect(src).not.toMatch(/NEXT_PUBLIC_/);
  });
});
