export * from './types';
export * from './mappers';
export {
  DuplicatePredictionRunError,
  InMemoryPredictionRepository,
  type PredictionRepository,
} from './predictionRepository';
export {
  InMemorySnapshotRepository,
  type SnapshotRepository,
} from './snapshotRepository';
// Phase 7A — Supabase-backed implementations satisfy the same interfaces.
// These pull in `server-only`; safe in scheduler / cron paths, refused in
// client component bundles by the build error from `server-only`.
export {
  SupabasePredictionRepository,
  SupabaseSnapshotRepository,
} from './supabase';
// Phase 7C — Neon / Vercel Postgres adapter. Same interfaces, same
// server-only enforcement. Priority over Supabase in repositoryFactory.
export {
  PostgresPredictionRepository,
  PostgresSnapshotRepository,
  PG_UNIQUE_VIOLATION,
  isUniqueViolation,
} from './postgres';
export {
  createPredictionRepository,
  createSnapshotRepository,
} from './repositoryFactory';
