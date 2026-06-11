import 'server-only';
import {
  InMemoryPredictionRepository,
  type PredictionRepository,
} from './predictionRepository';
import {
  InMemorySnapshotRepository,
  type SnapshotRepository,
} from './snapshotRepository';
import {
  getSupabaseServerClient,
  isSupabaseConfigured,
} from '../supabase/serverClient';
import {
  getPostgresClient,
  isPostgresConfigured,
} from '../postgres/serverClient';
import {
  SupabasePredictionRepository,
  SupabaseSnapshotRepository,
} from './supabase';
import {
  PostgresPredictionRepository,
  PostgresSnapshotRepository,
} from './postgres';

/**
 * Build a `PredictionRepository` matching the runtime environment. Priority:
 *
 *   1. POSTGRES_URL present                          → PostgresPredictionRepository
 *      (Neon / Vercel Postgres — the current production path)
 *   2. SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY      → SupabasePredictionRepository
 *      (alternate adapter for Supabase-hosted databases)
 *   3. neither                                        → InMemoryPredictionRepository
 *      (demo / development behaviour — no external service required)
 *
 * Phase 7C note: this factory is not yet wired into the cron route or
 * scheduler. Phase 7D will swap construction sites over to the factory; until
 * then the deployed UI continues to run against the demo helper.
 */
export function createPredictionRepository(): PredictionRepository {
  if (isPostgresConfigured()) {
    return new PostgresPredictionRepository(getPostgresClient());
  }
  if (isSupabaseConfigured()) {
    return new SupabasePredictionRepository(getSupabaseServerClient());
  }
  return new InMemoryPredictionRepository();
}

export function createSnapshotRepository(): SnapshotRepository {
  if (isPostgresConfigured()) {
    return new PostgresSnapshotRepository(getPostgresClient());
  }
  if (isSupabaseConfigured()) {
    return new SupabaseSnapshotRepository(getSupabaseServerClient());
  }
  return new InMemorySnapshotRepository();
}
