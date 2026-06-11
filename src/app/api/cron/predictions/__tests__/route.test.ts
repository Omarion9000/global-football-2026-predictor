import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '../route';

const SECRET = 'phase-5-test-secret';

function reqWithAuth(value?: string): Request {
  const headers: Record<string, string> = {};
  if (value != null) headers.authorization = value;
  return new Request('http://localhost/api/cron/predictions', { headers });
}

describe('GET /api/cron/predictions — auth', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', SECRET);
    // Tests run with NODE_ENV=test by default, which engages the strict path.
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 401 when no Authorization header is present', async () => {
    const res = await GET(reqWithAuth());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: 'unauthorized' });
  });

  it('returns 401 when Authorization header has the wrong bearer token', async () => {
    const res = await GET(reqWithAuth('Bearer wrong-secret'));
    expect(res.status).toBe(401);
  });

  it('returns 401 when the scheme is wrong even with a correct token', async () => {
    const res = await GET(reqWithAuth(`Token ${SECRET}`));
    expect(res.status).toBe(401);
  });

  it('returns 200 with a scheduler summary on a valid Bearer token', async () => {
    const res = await GET(reqWithAuth(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      modelVersion: string;
      due: number;
      succeeded: number;
      skipped: number;
      failed: number;
      warnings: string[];
    };
    expect(typeof body.modelVersion).toBe('string');
    expect(typeof body.due).toBe('number');
    expect(typeof body.succeeded).toBe('number');
    expect(typeof body.skipped).toBe('number');
    expect(typeof body.failed).toBe('number');
    expect(Array.isArray(body.warnings)).toBe(true);
  });

  it('returns 401 in production when CRON_SECRET is missing', async () => {
    vi.stubEnv('CRON_SECRET', '');
    vi.stubEnv('NODE_ENV', 'production');
    const res = await GET(reqWithAuth());
    expect(res.status).toBe(401);
  });

  it('allows unauthenticated requests in development when CRON_SECRET is missing', async () => {
    vi.stubEnv('CRON_SECRET', '');
    vi.stubEnv('NODE_ENV', 'development');
    const res = await GET(reqWithAuth());
    expect(res.status).toBe(200);
  });

  it('falls back to in-memory repositories and returns 200 when no DB env vars are set', async () => {
    vi.stubEnv('POSTGRES_URL', '');
    vi.stubEnv('POSTGRES_URL_NON_POOLING', '');
    vi.stubEnv('SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    const res = await GET(reqWithAuth(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { modelVersion: string; due: number };
    expect(typeof body.modelVersion).toBe('string');
    expect(typeof body.due).toBe('number');
  });

  it('never leaks a connection string or stack trace in 500 responses', async () => {
    // The route's catch block returns an opaque error. Confirm here as a
    // contract test — even if downstream throws unexpectedly, the body is
    // strictly `{ error: 'internal_error' }`.
    // (We don't trigger an actual 500 in this test — the assertion documents
    // the contract via inspection of the route source.)
    const fs = await import('node:fs');
    const path = await import('node:path');
    const url = await import('node:url');
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const src = fs.readFileSync(path.resolve(here, '../route.ts'), 'utf-8');
    // The catch block must return an opaque body — no err.message, no stack.
    expect(src).toMatch(/error:\s*'internal_error'/);
    expect(src).not.toMatch(/err\.message/);
    expect(src).not.toMatch(/err\.stack/);
    expect(src).not.toMatch(/console\.\w+\(/);
  });
});

describe('GET /api/cron/predictions — repository wiring (Phase 7D)', () => {
  it('constructs repositories through createPredictionRepository / createSnapshotRepository, not directly via InMemory*', async () => {
    // Source-level scan. Direct construction of InMemory* in the cron path
    // would defeat the factory's environment-based selection (Postgres in
    // production, in-memory in demo) — verified here to catch any regression
    // that ESLint can't see.
    const fs = await import('node:fs');
    const path = await import('node:path');
    const url = await import('node:url');
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const src = fs.readFileSync(path.resolve(here, '../route.ts'), 'utf-8');
    expect(src).toMatch(/createPredictionRepository\(\)/);
    expect(src).toMatch(/createSnapshotRepository\(\)/);
    expect(src).not.toMatch(/new InMemoryPredictionRepository\(/);
    expect(src).not.toMatch(/new InMemorySnapshotRepository\(/);
  });

  it('never imports a database client directly in the cron route', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const url = await import('node:url');
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const src = fs.readFileSync(path.resolve(here, '../route.ts'), 'utf-8');
    // The factory module is the right boundary — it imports the driver
    // packages behind `server-only`. The cron route only consumes typed
    // repository interfaces.
    expect(src).not.toMatch(/from ['"]@supabase\/supabase-js/);
    expect(src).not.toMatch(/from ['"]@neondatabase\/serverless/);
    expect(src).not.toMatch(/from ['"]@\/lib\/data\/supabase/);
    expect(src).not.toMatch(/from ['"]@\/lib\/data\/postgres/);
  });
});
