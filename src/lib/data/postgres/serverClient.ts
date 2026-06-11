// =============================================================================
// Postgres server-only client (Neon HTTP driver).
// =============================================================================
// Reads POSTGRES_URL (pooled) and POSTGRES_URL_NON_POOLING (direct) and builds
// a Neon HTTP query function. Vercel's Marketplace Neon integration populates
// both variables automatically in Production and Preview.
//
// Three layers of enforcement protect against accidental client exposure:
//   1. `import 'server-only'` raises a build error if this module ends up in
//      any client bundle.
//   2. The ESLint UI boundary blocks `src/components/**` from importing this
//      path or `@neondatabase/serverless`.
//   3. A runtime backstop test scans every component source file for the
//      same forbidden imports.
//
// Errors NEVER include the connection string — leaking credentials in error
// messages would defeat the whole point of keeping the URL server-only.

import 'server-only';
import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

export class PostgresConfigError extends Error {
  readonly missing: readonly string[];

  constructor(missing: readonly string[]) {
    super(
      `Postgres server client is not configured: missing ${missing.join(', ')}. ` +
        'Set these as server-only environment variables in Vercel project settings. ' +
        'Do NOT prefix with NEXT_PUBLIC_.',
    );
    this.name = 'PostgresConfigError';
    this.missing = missing;
    Object.setPrototypeOf(this, PostgresConfigError.prototype);
  }
}

/** True when the pooled connection string is present. */
export function isPostgresConfigured(): boolean {
  return Boolean(process.env.POSTGRES_URL);
}

export type SqlClient = NeonQueryFunction<false, false>;

let cachedClient: SqlClient | null = null;
let cachedUrl: string | null = null;

/**
 * Returns (or builds) the pooled Neon HTTP query function. Throws
 * PostgresConfigError if POSTGRES_URL is not set — the caller decides whether
 * that is a hard failure (Postgres-required path) or a soft fallback (factory
 * down-shifting to Supabase or in-memory).
 */
export function getPostgresClient(): SqlClient {
  const url = process.env.POSTGRES_URL;
  if (!url) {
    throw new PostgresConfigError(['POSTGRES_URL']);
  }
  if (cachedClient && cachedUrl === url) {
    return cachedClient;
  }
  cachedClient = neon(url);
  cachedUrl = url;
  return cachedClient;
}

/**
 * Returns a direct (non-pooled) Neon HTTP query function. Used by migration
 * scripts and other long-lived operations where pgbouncer pooling is not
 * appropriate. Falls back to POSTGRES_URL when POSTGRES_URL_NON_POOLING is
 * absent (e.g., local development).
 */
export function getPostgresMigrationClient(): SqlClient {
  // Use || rather than ?? so an empty string (e.g. `vi.stubEnv(..., '')` in
  // tests, or an explicit empty value in `.env.local`) is treated as "unset"
  // and falls through to POSTGRES_URL.
  const url = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
  if (!url) {
    throw new PostgresConfigError(['POSTGRES_URL_NON_POOLING (or POSTGRES_URL)']);
  }
  return neon(url);
}

/** Test-only helper. Resets the cached client so vi.stubEnv changes apply. */
export function __resetPostgresClientCacheForTests(): void {
  cachedClient = null;
  cachedUrl = null;
}
