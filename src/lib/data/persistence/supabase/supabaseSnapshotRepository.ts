import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SnapshotRepository } from '../snapshotRepository';
import type { DataSnapshotInsert, DataSnapshotRow } from '../types';

const DATA_SNAPSHOTS = 'data_snapshots' as const;

/**
 * Supabase-backed implementation of the existing SnapshotRepository interface.
 * Like the prediction repository, this exposes only insert/get/list methods —
 * no update / patch / delete. Data snapshots are an internal append-only
 * record per docs/04 §4.5.
 */
export class SupabaseSnapshotRepository implements SnapshotRepository {
  constructor(private readonly client: SupabaseClient) {}

  async insertSnapshot(
    insert: DataSnapshotInsert,
  ): Promise<DataSnapshotRow> {
    const { data, error } = await this.client
      .from(DATA_SNAPSHOTS)
      .insert(insert)
      .select('*')
      .single();
    if (error) {
      throw new Error(
        `SupabaseSnapshotRepository.insertSnapshot: ${error.message}`,
      );
    }
    if (!data) {
      throw new Error(
        'SupabaseSnapshotRepository.insertSnapshot: no row returned',
      );
    }
    return data as DataSnapshotRow;
  }

  async getSnapshotById(id: string): Promise<DataSnapshotRow | null> {
    const { data, error } = await this.client
      .from(DATA_SNAPSHOTS)
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) {
      throw new Error(
        `SupabaseSnapshotRepository.getSnapshotById: ${error.message}`,
      );
    }
    return (data as DataSnapshotRow | null) ?? null;
  }

  async listSnapshotsForFixture(
    fixtureId: string,
  ): Promise<readonly DataSnapshotRow[]> {
    const { data, error } = await this.client
      .from(DATA_SNAPSHOTS)
      .select('*')
      .eq('fixture_id', fixtureId)
      .order('captured_at', { ascending: true });
    if (error) {
      throw new Error(
        `SupabaseSnapshotRepository.listSnapshotsForFixture: ${error.message}`,
      );
    }
    return (data ?? []) as DataSnapshotRow[];
  }
}
