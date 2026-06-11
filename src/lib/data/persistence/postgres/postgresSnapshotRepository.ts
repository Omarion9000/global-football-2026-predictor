import 'server-only';
import type { SqlClient } from '../../postgres/serverClient';
import type { SnapshotRepository } from '../snapshotRepository';
import type { DataSnapshotInsert, DataSnapshotRow } from '../types';

/**
 * Neon Postgres implementation of the existing SnapshotRepository interface.
 * Reads and writes against the `data_snapshots` table defined in
 * `supabase/migrations/0001_init.sql`. Like the prediction repository, this
 * exposes only insert/get/list methods — no update / patch / delete.
 */
export class PostgresSnapshotRepository implements SnapshotRepository {
  constructor(private readonly sql: SqlClient) {}

  async insertSnapshot(insert: DataSnapshotInsert): Promise<DataSnapshotRow> {
    const sourceIdsJson = JSON.stringify(insert.source_ids);
    const payloadJson = insert.payload == null ? null : JSON.stringify(insert.payload);
    const rows = (await this.sql`
      INSERT INTO data_snapshots (
        id,
        fixture_id,
        captured_at,
        source_ids,
        input_hash,
        payload
      ) VALUES (
        ${insert.id},
        ${insert.fixture_id},
        ${insert.captured_at},
        ${sourceIdsJson}::jsonb,
        ${insert.input_hash},
        ${payloadJson === null ? null : (payloadJson as unknown)}
      )
      RETURNING *
    `) as DataSnapshotRow[];
    if (rows.length === 0) {
      throw new Error(
        'PostgresSnapshotRepository.insertSnapshot: no row returned',
      );
    }
    return rows[0];
  }

  async getSnapshotById(id: string): Promise<DataSnapshotRow | null> {
    const rows = (await this.sql`
      SELECT * FROM data_snapshots WHERE id = ${id} LIMIT 1
    `) as DataSnapshotRow[];
    return rows[0] ?? null;
  }

  async listSnapshotsForFixture(
    fixtureId: string,
  ): Promise<readonly DataSnapshotRow[]> {
    const rows = (await this.sql`
      SELECT * FROM data_snapshots
      WHERE fixture_id = ${fixtureId}
      ORDER BY captured_at ASC
    `) as DataSnapshotRow[];
    return rows;
  }
}
