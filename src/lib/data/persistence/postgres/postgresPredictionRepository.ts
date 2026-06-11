import 'server-only';
import type { SqlClient } from '../../postgres/serverClient';
import type { PredictionRepository } from '../predictionRepository';
import type {
  PredictionRunInsert,
  PredictionRunRow,
  PredictionScorelineInsert,
  PredictionScorelineRow,
  RunTypeRow,
} from '../types';
import { DuplicatePredictionRunError, isUniqueViolation } from './errors';

/**
 * Neon Postgres implementation of the existing PredictionRepository interface.
 * Reads and writes against the tables defined in
 * `supabase/migrations/0001_init.sql` (`prediction_runs`,
 * `prediction_scorelines`). Append-only semantics are enforced both at the SQL
 * level (the UNIQUE constraint on the idempotency key) and at the TypeScript
 * API surface (no update / patch / delete methods exist on this class).
 *
 * The Neon HTTP `sql` tagged-template returns rows directly as an array; no
 * client/release lifecycle is needed for one-shot queries.
 */
export class PostgresPredictionRepository implements PredictionRepository {
  constructor(private readonly sql: SqlClient) {}

  async insertPredictionRun(
    insert: PredictionRunInsert,
  ): Promise<PredictionRunRow> {
    const warningsJson = JSON.stringify(insert.warnings);
    try {
      const rows = (await this.sql`
        INSERT INTO prediction_runs (
          fixture_id,
          run_type,
          model_version,
          scheduled_for,
          executed_at,
          data_snapshot_id,
          team_a_win_probability,
          draw_probability,
          team_b_win_probability,
          team_a_expected_goals,
          team_b_expected_goals,
          confidence_score,
          confidence_band,
          warnings
        ) VALUES (
          ${insert.fixture_id},
          ${insert.run_type},
          ${insert.model_version},
          ${insert.scheduled_for},
          ${insert.executed_at},
          ${insert.data_snapshot_id},
          ${insert.team_a_win_probability},
          ${insert.draw_probability},
          ${insert.team_b_win_probability},
          ${insert.team_a_expected_goals},
          ${insert.team_b_expected_goals},
          ${insert.confidence_score},
          ${insert.confidence_band},
          ${warningsJson}::jsonb
        )
        RETURNING *
      `) as PredictionRunRow[];
      if (rows.length === 0) {
        throw new Error(
          'PostgresPredictionRepository.insertPredictionRun: no row returned',
        );
      }
      return rows[0];
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new DuplicatePredictionRunError({
          fixtureId: insert.fixture_id,
          runType: insert.run_type,
          modelVersion: insert.model_version,
          scheduledFor: insert.scheduled_for,
        });
      }
      if (err instanceof DuplicatePredictionRunError) throw err;
      throw new Error(
        `PostgresPredictionRepository.insertPredictionRun: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  async insertPredictionScorelines(
    rows: readonly PredictionScorelineInsert[],
  ): Promise<readonly PredictionScorelineRow[]> {
    if (rows.length === 0) return [];
    const inserted: PredictionScorelineRow[] = [];
    // The Neon HTTP function does not support multi-row VALUES interpolation
    // ergonomically, so we insert one row at a time. For the V1 cron path
    // (≤5 scorelines per prediction) the HTTP cost is acceptable.
    for (const r of rows) {
      const result = (await this.sql`
        INSERT INTO prediction_scorelines (
          prediction_run_id,
          team_a_goals,
          team_b_goals,
          probability,
          rank
        ) VALUES (
          ${r.prediction_run_id},
          ${r.team_a_goals},
          ${r.team_b_goals},
          ${r.probability},
          ${r.rank}
        )
        RETURNING *
      `) as PredictionScorelineRow[];
      if (result[0]) inserted.push(result[0]);
    }
    return inserted;
  }

  async getPredictionRunById(id: string): Promise<PredictionRunRow | null> {
    const rows = (await this.sql`
      SELECT * FROM prediction_runs WHERE id = ${id} LIMIT 1
    `) as PredictionRunRow[];
    return rows[0] ?? null;
  }

  async getLatestPredictionForFixture(
    fixtureId: string,
    runType: RunTypeRow,
  ): Promise<PredictionRunRow | null> {
    const rows = (await this.sql`
      SELECT * FROM prediction_runs
      WHERE fixture_id = ${fixtureId}
        AND run_type = ${runType}
      ORDER BY executed_at DESC
      LIMIT 1
    `) as PredictionRunRow[];
    return rows[0] ?? null;
  }

  async listPredictionHistoryForFixture(
    fixtureId: string,
  ): Promise<readonly PredictionRunRow[]> {
    const rows = (await this.sql`
      SELECT * FROM prediction_runs
      WHERE fixture_id = ${fixtureId}
      ORDER BY executed_at ASC
    `) as PredictionRunRow[];
    return rows;
  }

  async listScorelinesForRun(
    predictionRunId: string,
  ): Promise<readonly PredictionScorelineRow[]> {
    const rows = (await this.sql`
      SELECT * FROM prediction_scorelines
      WHERE prediction_run_id = ${predictionRunId}
      ORDER BY rank ASC
    `) as PredictionScorelineRow[];
    return rows;
  }
}
