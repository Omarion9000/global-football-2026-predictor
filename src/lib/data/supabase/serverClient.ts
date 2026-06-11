// =============================================================================
// Supabase server-only client.
// =============================================================================
// This module reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY and constructs
// a Supabase client that bypasses Row-Level Security via the service-role
// credential. It MUST NOT be imported by client components.
//
// Three layers of enforcement protect against accidental client exposure:
//
//   1. The `import 'server-only'` below raises a build error if this module
//      ends up in any client bundle.
//   2. The ESLint UI boundary in `.eslintrc.json` blocks
//      `src/components/**` from importing this path or `@supabase/supabase-js`.
//   3. A runtime test in `src/components/__tests__/ui-boundaries.test.ts`
//      scans every component source file for the same forbidden imports.
//
// The service-role key MUST NEVER be prefixed with NEXT_PUBLIC_. The
// vocabulary scan in this file's own test ensures the prefix never appears in
// any Supabase-related source.

import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export class SupabaseConfigError extends Error {
  readonly missing: readonly string[];

  constructor(missing: readonly string[]) {
    super(
      `Supabase server client is not configured: missing ${missing.join(', ')}. ` +
        'Set these as server-only environment variables in Vercel project settings. ' +
        'Do NOT prefix with NEXT_PUBLIC_.',
    );
    this.name = 'SupabaseConfigError';
    this.missing = missing;
    Object.setPrototypeOf(this, SupabaseConfigError.prototype);
  }
}

/** Returns true when BOTH server-only env variables are present. */
export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

let cachedClient: SupabaseClient | null = null;
let cachedClientUrl: string | null = null;

/**
 * Build (or return a cached) Supabase server client. Throws SupabaseConfigError
 * if either required env var is missing — the caller decides whether that is
 * a hard failure (Supabase mode) or a soft fallback (in-memory mode).
 *
 * The client is cached per-URL so swap-ins during tests (`vi.stubEnv`) take
 * effect cleanly: changing SUPABASE_URL invalidates the cache.
 */
export function getSupabaseServerClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const missing: string[] = [];
  if (!url) missing.push('SUPABASE_URL');
  if (!key) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (missing.length > 0) {
    throw new SupabaseConfigError(missing);
  }
  if (cachedClient && cachedClientUrl === url) {
    return cachedClient;
  }
  cachedClient = createClient(url!, key!, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  cachedClientUrl = url!;
  return cachedClient;
}

/** Test-only helper. Resets the cached client so vi.stubEnv changes apply. */
export function __resetSupabaseClientCacheForTests(): void {
  cachedClient = null;
  cachedClientUrl = null;
}
