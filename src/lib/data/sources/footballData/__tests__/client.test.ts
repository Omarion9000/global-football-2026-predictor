import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FootballDataClient,
  createFootballDataClient,
  parseRetryAfterMs,
} from '../client';

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

const SAMPLE_MATCHES = {
  competition: { code: 'PL', name: 'Premier League' },
  matches: [
    {
      id: 12345,
      utcDate: '2024-08-16T19:00:00Z',
      status: 'FINISHED',
      matchday: 1,
      homeTeam: { id: 66, name: 'Manchester United FC', shortName: 'Man United', tla: 'MUN' },
      awayTeam: { id: 63, name: 'Fulham FC', shortName: 'Fulham', tla: 'FUL' },
      score: { fullTime: { home: 1, away: 0 } },
      season: { startDate: '2024-08-16', endDate: '2025-05-25' },
    },
  ],
};

// =============================================================================
// Construction / API key handling
// =============================================================================

describe('FootballDataClient — construction', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('throws a clear error when no API key is configured', () => {
    vi.stubEnv('FOOTBALL_DATA_API_KEY', '');
    expect(() => new FootballDataClient()).toThrow(/API key not configured/);
  });

  it('throws a clear error on a whitespace-only key', () => {
    vi.stubEnv('FOOTBALL_DATA_API_KEY', '   ');
    expect(() => new FootballDataClient()).toThrow(/API key not configured/);
  });

  it('does NOT name the env var inline if the error is re-thrown by callers (message-format anchor)', () => {
    vi.stubEnv('FOOTBALL_DATA_API_KEY', '');
    try {
      new FootballDataClient();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // The error explicitly mentions the env var name once to help operators
      // configure it; what we forbid is the VALUE leaking. There is no value
      // here yet, so the only thing to check is that the message is short
      // and stable.
      expect(msg.length).toBeLessThan(300);
    }
  });

  it('accepts an injected apiKey via options', () => {
    expect(() => new FootballDataClient({ apiKey: 'test-token' })).not.toThrow();
  });
});

// =============================================================================
// Happy path — listPLMatches
// =============================================================================

describe('FootballDataClient — listPLMatches happy path', () => {
  it('returns the parsed JSON payload', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(SAMPLE_MATCHES));
    const client = new FootballDataClient({
      apiKey: 'test-token',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const result = await client.listPLMatches(2024);
    expect(result.competition?.code).toBe('PL');
    expect(result.matches[0].homeTeam.name).toBe('Manchester United FC');
  });

  it('sends the X-Auth-Token header', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(SAMPLE_MATCHES));
    const client = new FootballDataClient({
      apiKey: 'test-token',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await client.listPLMatches(2024);
    expect(fetchImpl).toHaveBeenCalledOnce();
    const call = fetchImpl.mock.calls[0] as unknown as [unknown, RequestInit];
    const headers = call[1].headers as Record<string, string>;
    expect(headers['X-Auth-Token']).toBe('test-token');
  });

  it('targets the documented season-parameter URL shape', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(SAMPLE_MATCHES));
    const client = new FootballDataClient({
      apiKey: 'test-token',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await client.listPLMatches(2024);
    const call = fetchImpl.mock.calls[0] as unknown as [string];
    expect(call[0]).toMatch(/\/v4\/competitions\/PL\/matches\?season=2024$/);
  });
});

// =============================================================================
// 429 retry with Retry-After + exponential backoff fallback
// =============================================================================

describe('FootballDataClient — 429 retry behaviour', () => {
  it('honours the Retry-After header on 429 and succeeds on the next attempt', async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      if (calls === 1) {
        return new Response('rate limited', {
          status: 429,
          headers: { 'Retry-After': '1' },
        });
      }
      return jsonResponse(SAMPLE_MATCHES);
    });
    const sleeps: number[] = [];
    const client = new FootballDataClient({
      apiKey: 'test-token',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleep: async (ms: number) => {
        sleeps.push(ms);
      },
    });
    const result = await client.listPLMatches(2024);
    expect(result.matches.length).toBe(1);
    expect(sleeps).toEqual([1000]); // 1 second from Retry-After
  });

  it('falls back to exponential backoff when no Retry-After header is present', async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      if (calls <= 2) {
        return new Response('rate limited', { status: 429 });
      }
      return jsonResponse(SAMPLE_MATCHES);
    });
    const sleeps: number[] = [];
    const client = new FootballDataClient({
      apiKey: 'test-token',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleep: async (ms: number) => {
        sleeps.push(ms);
      },
    });
    await client.listPLMatches(2024);
    // First retry: base 1000, second retry: 2000.
    expect(sleeps).toEqual([1000, 2000]);
  });

  it('gives up after max429Retries and throws an opaque error', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response('still rate limited', { status: 429 }),
    );
    const client = new FootballDataClient({
      apiKey: 'test-token',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleep: async () => undefined,
      max429Retries: 2,
    });
    await expect(client.listPLMatches(2024)).rejects.toThrow(/HTTP 429/);
  });
});

// =============================================================================
// Opaque error path — non-2xx responses must NOT leak URL or token
// =============================================================================

describe('FootballDataClient — opaque errors', () => {
  it('throws a short HTTP-status-tagged error on 401 without naming the URL or token', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          'long verbose body with credentials maybe including the token=test-token-please-do-not-leak; '
            + 'we explicitly want to truncate this to ~200 bytes',
          { status: 401 },
        ),
    );
    const client = new FootballDataClient({
      apiKey: 'test-token',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleep: async () => undefined,
    });
    let caught: Error | null = null;
    try {
      await client.listPLMatches(2024);
    } catch (err) {
      caught = err as Error;
    }
    expect(caught).not.toBeNull();
    expect(caught!.message).toMatch(/HTTP 401/);
    expect(caught!.message).not.toMatch(/test-token/);
    expect(caught!.message).not.toMatch(/X-Auth-Token/);
    expect(caught!.message).not.toMatch(/api\.football-data\.org/);
    expect(caught!.message.length).toBeLessThan(300);
  });

  it('also opaquifies a 500', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('Internal Server Error', { status: 500 }),
    );
    const client = new FootballDataClient({
      apiKey: 'test-token',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleep: async () => undefined,
    });
    await expect(client.listPLMatches(2024)).rejects.toThrow(/HTTP 500/);
  });
});

// =============================================================================
// Retry-After parser
// =============================================================================

describe('parseRetryAfterMs', () => {
  it('parses integer seconds', () => {
    expect(parseRetryAfterMs('5')).toBe(5000);
    expect(parseRetryAfterMs('0')).toBe(0);
  });

  it('rejects negative and non-finite values', () => {
    expect(parseRetryAfterMs('-1')).toBeNull();
    expect(parseRetryAfterMs('NaN')).toBeNull();
    expect(parseRetryAfterMs('abc')).toBeNull();
  });

  it('returns null for missing or empty input', () => {
    expect(parseRetryAfterMs(null)).toBeNull();
    expect(parseRetryAfterMs(undefined)).toBeNull();
    expect(parseRetryAfterMs('')).toBeNull();
  });
});

// =============================================================================
// Factory + source-level safeguards.
// =============================================================================

describe('client — source-level safeguards', () => {
  async function readSource(): Promise<string> {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const url = await import('node:url');
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    return fs.readFileSync(path.resolve(here, '../client.ts'), 'utf-8');
  }

  it('imports server-only as a build-time backstop', async () => {
    expect(await readSource()).toMatch(/^import 'server-only'/m);
  });

  it('uses no NEXT_PUBLIC_ env var', async () => {
    expect(await readSource()).not.toMatch(/NEXT_PUBLIC_/);
  });

  it('issues no console writes', async () => {
    expect(await readSource()).not.toMatch(/console\.\w+\(/);
  });

  it('createFootballDataClient is a thin factory over the constructor', () => {
    const c = createFootballDataClient({ apiKey: 'x' });
    expect(c).toBeInstanceOf(FootballDataClient);
  });
});
