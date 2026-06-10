import type { DataSnapshotInsert, DataSnapshotRow } from './types';

/**
 * Persistence interface for data_snapshots. The snapshot body is internal and
 * not redistributed per docs/04 §4.5; the repository surface only exposes
 * snapshot reads needed by the scheduler.
 */
export interface SnapshotRepository {
  insertSnapshot(insert: DataSnapshotInsert): Promise<DataSnapshotRow>;
  getSnapshotById(id: string): Promise<DataSnapshotRow | null>;
  listSnapshotsForFixture(
    fixtureId: string,
  ): Promise<readonly DataSnapshotRow[]>;
}

export class InMemorySnapshotRepository implements SnapshotRepository {
  private readonly snapshots = new Map<string, DataSnapshotRow>();

  async insertSnapshot(insert: DataSnapshotInsert): Promise<DataSnapshotRow> {
    if (this.snapshots.has(insert.id)) {
      throw new Error(`duplicate snapshot id: ${insert.id}`);
    }
    const row: DataSnapshotRow = {
      id: insert.id,
      fixture_id: insert.fixture_id,
      captured_at: insert.captured_at,
      source_ids: insert.source_ids,
      input_hash: insert.input_hash,
      payload: insert.payload ?? null,
      created_at: new Date().toISOString(),
    };
    this.snapshots.set(row.id, row);
    return row;
  }

  async getSnapshotById(id: string): Promise<DataSnapshotRow | null> {
    return this.snapshots.get(id) ?? null;
  }

  async listSnapshotsForFixture(
    fixtureId: string,
  ): Promise<readonly DataSnapshotRow[]> {
    return [...this.snapshots.values()]
      .filter((s) => s.fixture_id === fixtureId)
      .sort((a, b) => a.captured_at.localeCompare(b.captured_at));
  }
}
