// Re-exports the canonical typed errors so Postgres repositories don't reach
// across module boundaries to throw them.

export { DuplicatePredictionRunError } from '../predictionRepository';

/**
 * PostgreSQL unique-violation SQLSTATE. Both the Neon driver and node-postgres
 * surface this verbatim on the thrown error's `code` field.
 * See https://www.postgresql.org/docs/current/errcodes-appendix.html.
 */
export const PG_UNIQUE_VIOLATION = '23505' as const;

/**
 * Best-effort check for a PG unique-violation regardless of driver. The Neon
 * HTTP driver surfaces the code as `err.code`; node-postgres uses the same;
 * some wrappers nest it under `err.cause`. This handles the common shapes
 * without a hard dep on a particular driver's error class.
 */
export function isUniqueViolation(err: unknown): boolean {
  if (err == null || typeof err !== 'object') return false;
  const e = err as { code?: unknown; cause?: { code?: unknown } };
  if (e.code === PG_UNIQUE_VIOLATION) return true;
  if (e.cause && typeof e.cause === 'object' && e.cause.code === PG_UNIQUE_VIOLATION) {
    return true;
  }
  return false;
}
