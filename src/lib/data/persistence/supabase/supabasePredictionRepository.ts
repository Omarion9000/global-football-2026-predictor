import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  PredictionRepository,
} from '../predictionRepository';
import type {
  PredictionRunInsert,
  PredictionRunRow,
  PredictionScorelineInsert,
  PredictionScorelineRow,
  RunTypeRow,
} from '../types';
import { DuplicatePredictionRunError, PG_UNIQUE_VIOLATION } from './errors';

const PREDICTION_RUNS = 'prediction_runs' as const;
const PREDICTION_SCORELINES = 'prediction_scorelines' as const;

/**
 * Supabase-backed implementation of the existing PredictionRepository
 * interface. Exposes only insert/get/list methods — there are NO update,
 * patch, or delete methods, by design. Append-only is encoded in the API
 * surface itself, mirroring the SQL UNIQUE constraint on
 * (fixture_id, run_type, model_version, scheduled_for).
 */
export class SupabasePredictionRepository implements PredictionRepository {
  constructor(private readonly client: SupabaseClient) {}

  async insertPredictionRun(
    insert: PredictionRunInsert,
  ): Promise<PredictionRunRow> {
    const { data, error } = await this.client
      .from(PREDICTION_RUNS)
      .insert(insert)
      .select('*')
      .single();

    if (error) {
      if (error.code === PG_UNIQUE_VIOLATION) {
        throw new DuplicatePredictionRunError({
          fixtureId: insert.fixture_id,
          runType: insert.run_type,
          modelVersion: insert.model_version,
          scheduledFor: insert.scheduled_for,
        });
      }
      throw new Error(
        `SupabasePredictionRepository.insertPredictionRun: ${error.message}`,
      );
    }
    if (!data) {
      throw new Error(
        'SupabasePredictionRepository.insertPredictionRun: no row returned',
      );
    }
    return data as PredictionRunRow;
  }

  async insertPredictionScorelines(
    rows: readonly PredictionScorelineInsert[],
  ): Promise<readonly PredictionScorelineRow[]> {
    if (rows.length === 0) return [];
    const { data, error } = await this.client
      .from(PREDICTION_SCORELINES)
      .insert(rows as PredictionScorelineInsert[])
      .select('*');
    if (error) {
      throw new Error(
        `SupabasePredictionRepository.insertPredictionScorelines: ${error.message}`,
      );
    }
    return (data ?? []) as PredictionScorelineRow[];
  }

  async getPredictionRunById(id: string): Promise<PredictionRunRow | null> {
    const { data, error } = await this.client
      .from(PREDICTION_RUNS)
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) {
      throw new Error(
        `SupabasePredictionRepository.getPredictionRunById: ${error.message}`,
      );
    }
    return (data as PredictionRunRow | null) ?? null;
  }

  async getLatestPredictionForFixture(
    fixtureId: string,
    runType: RunTypeRow,
  ): Promise<PredictionRunRow | null> {
    const { data, error } = await this.client
      .from(PREDICTION_RUNS)
      .select('*')
      .eq('fixture_id', fixtureId)
      .eq('run_type', runType)
      .order('executed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      throw new Error(
        `SupabasePredictionRepository.getLatestPredictionForFixture: ${error.message}`,
      );
    }
    return (data as PredictionRunRow | null) ?? null;
  }

  async listPredictionHistoryForFixture(
    fixtureId: string,
  ): Promise<readonly PredictionRunRow[]> {
    const { data, error } = await this.client
      .from(PREDICTION_RUNS)
      .select('*')
      .eq('fixture_id', fixtureId)
      .order('executed_at', { ascending: true });
    if (error) {
      throw new Error(
        `SupabasePredictionRepository.listPredictionHistoryForFixture: ${error.message}`,
      );
    }
    return (data ?? []) as PredictionRunRow[];
  }

  async listScorelinesForRun(
    predictionRunId: string,
  ): Promise<readonly PredictionScorelineRow[]> {
    const { data, error } = await this.client
      .from(PREDICTION_SCORELINES)
      .select('*')
      .eq('prediction_run_id', predictionRunId)
      .order('rank', { ascending: true });
    if (error) {
      throw new Error(
        `SupabasePredictionRepository.listScorelinesForRun: ${error.message}`,
      );
    }
    return (data ?? []) as PredictionScorelineRow[];
  }
}
