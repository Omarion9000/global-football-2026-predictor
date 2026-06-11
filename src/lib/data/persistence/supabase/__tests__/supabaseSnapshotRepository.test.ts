import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseSnapshotRepository } from '../supabaseSnapshotRepository';
import type {
  DataSnapshotInsert,
  DataSnapshotRow,
  SnapshotRepository,
} from '../../';
import { makeMockClient } from './_mockClient';

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

describe('SupabaseSnapshotRepository — interface shape', () => {
  it('satisfies the SnapshotRepository contract structurally', () => {
    const m = makeMockClient();
    const repo: SnapshotRepository = new SupabaseSnapshotRepository(
      m as unknown as SupabaseClient,
    );
    expect(typeof repo.insertSnapshot).toBe('function');
    expect(typeof repo.getSnapshotById).toBe('function');
    expect(typeof repo.listSnapshotsForFixture).toBe('function');
  });

  it('does not expose update / patch / delete methods on the prototype', () => {
    const m = makeMockClient();
    const repo = new SupabaseSnapshotRepository(
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

describe('SupabaseSnapshotRepository — insertSnapshot', () => {
  it('calls from("data_snapshots").insert(row).select("*").single()', async () => {
    const m = makeMockClient({
      data_snapshots: { data: SNAPSHOT_ROW, error: null },
    });
    const repo = new SupabaseSnapshotRepository(m as unknown as SupabaseClient);
    const result = await repo.insertSnapshot(SNAPSHOT_INSERT);
    expect(result).toEqual(SNAPSHOT_ROW);
    expect(m.from).toHaveBeenCalledWith('data_snapshots');
    const builder = m.builderForTable('data_snapshots');
    expect(builder?.insert).toHaveBeenCalledWith(SNAPSHOT_INSERT);
    expect(builder?.select).toHaveBeenCalledWith('*');
    expect(builder?.single).toHaveBeenCalledTimes(1);
  });

  it('throws if Supabase returns an error', async () => {
    const m = makeMockClient({
      data_snapshots: {
        data: null,
        error: { code: '42501', message: 'permission denied' },
      },
    });
    const repo = new SupabaseSnapshotRepository(m as unknown as SupabaseClient);
    await expect(repo.insertSnapshot(SNAPSHOT_INSERT)).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe('SupabaseSnapshotRepository — reads', () => {
  it('getSnapshotById queries by id with maybeSingle', async () => {
    const m = makeMockClient({
      data_snapshots: { data: SNAPSHOT_ROW, error: null },
    });
    const repo = new SupabaseSnapshotRepository(m as unknown as SupabaseClient);
    const result = await repo.getSnapshotById('snap-001');
    expect(result).toEqual(SNAPSHOT_ROW);
    const builder = m.builderForTable('data_snapshots');
    expect(builder?.select).toHaveBeenCalledWith('*');
    expect(builder?.eq).toHaveBeenCalledWith('id', 'snap-001');
    expect(builder?.maybeSingle).toHaveBeenCalledTimes(1);
  });

  it('listSnapshotsForFixture orders by captured_at asc', async () => {
    const m = makeMockClient({
      data_snapshots: { data: [SNAPSHOT_ROW], error: null },
    });
    const repo = new SupabaseSnapshotRepository(m as unknown as SupabaseClient);
    const rows = await repo.listSnapshotsForFixture('fixture-001');
    expect(rows).toEqual([SNAPSHOT_ROW]);
    const builder = m.builderForTable('data_snapshots');
    expect(builder?.eq).toHaveBeenCalledWith('fixture_id', 'fixture-001');
    expect(builder?.order).toHaveBeenCalledWith('captured_at', { ascending: true });
  });

  it('returns null when the row is not found', async () => {
    const m = makeMockClient({
      data_snapshots: { data: null, error: null },
    });
    const repo = new SupabaseSnapshotRepository(m as unknown as SupabaseClient);
    expect(await repo.getSnapshotById('unknown')).toBeNull();
  });
});

describe('SupabaseSnapshotRepository — source-level safeguards', () => {
  it('source file imports "server-only" and uses no NEXT_PUBLIC_ prefix', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const url = await import('node:url');
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const src = fs.readFileSync(
      path.resolve(here, '../supabaseSnapshotRepository.ts'),
      'utf-8',
    );
    expect(src).toMatch(/^import 'server-only'/m);
    expect(src).not.toMatch(/NEXT_PUBLIC_/);
  });
});
