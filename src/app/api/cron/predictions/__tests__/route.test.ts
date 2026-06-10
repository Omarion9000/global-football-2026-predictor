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
});
