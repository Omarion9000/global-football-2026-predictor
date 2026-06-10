import { describe, expect, it } from 'vitest';
import {
  InMemorySnapshotRepository,
  type SnapshotRepository,
} from '../';

describe('SnapshotRepository — no update methods', () => {
  it('InMemorySnapshotRepository exposes only insert/get/list', () => {
    const repo: SnapshotRepository = new InMemorySnapshotRepository();
    const methods = Object.getOwnPropertyNames(
      Object.getPrototypeOf(repo),
    ).filter((m) => m !== 'constructor');
    for (const m of methods) {
      expect(m.toLowerCase()).not.toMatch(/update|patch|modify|delete/);
    }
  });
});

describe('InMemorySnapshotRepository', () => {
  it('inserts and reads back a snapshot', async () => {
    const repo = new InMemorySnapshotRepository();
    const row = await repo.insertSnapshot({
      id: 'snap-1',
      fixture_id: 'fixture-001',
      captured_at: '2026-06-11T17:00:00Z',
      source_ids: ['mock'],
      input_hash: 'abc123',
      payload: { foo: 'bar' },
    });
    expect(row.id).toBe('snap-1');
    expect(await repo.getSnapshotById('snap-1')).toEqual(row);
  });

  it('rejects duplicate snapshot ids', async () => {
    const repo = new InMemorySnapshotRepository();
    await repo.insertSnapshot({
      id: 'snap-1',
      fixture_id: 'f',
      captured_at: 't',
      source_ids: [],
      input_hash: 'h',
      payload: null,
    });
    await expect(
      repo.insertSnapshot({
        id: 'snap-1',
        fixture_id: 'f',
        captured_at: 't',
        source_ids: [],
        input_hash: 'h',
        payload: null,
      }),
    ).rejects.toThrow();
  });

  it('lists snapshots for a fixture ordered by captured_at', async () => {
    const repo = new InMemorySnapshotRepository();
    await repo.insertSnapshot({
      id: 'snap-late',
      fixture_id: 'f',
      captured_at: '2026-06-11T20:00:00Z',
      source_ids: [],
      input_hash: 'h2',
      payload: null,
    });
    await repo.insertSnapshot({
      id: 'snap-early',
      fixture_id: 'f',
      captured_at: '2026-06-11T17:00:00Z',
      source_ids: [],
      input_hash: 'h1',
      payload: null,
    });
    const list = await repo.listSnapshotsForFixture('f');
    expect(list.map((s) => s.id)).toEqual(['snap-early', 'snap-late']);
  });
});
