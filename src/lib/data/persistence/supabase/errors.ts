// Re-exports the existing typed errors from the persistence interface so
// Supabase repositories don't need to reach across module boundaries to
// throw them.

export { DuplicatePredictionRunError } from '../predictionRepository';

/**
 * PostgreSQL unique-violation SQLSTATE. Supabase surfaces this verbatim in
 * the `error.code` field returned from `.from(...).insert(...)`.
 * See https://www.postgresql.org/docs/current/errcodes-appendix.html.
 */
export const PG_UNIQUE_VIOLATION = '23505' as const;
