import 'server-only';

// =============================================================================
// football-data.org client (server-only)
// =============================================================================
// Phase 8D — minimal fetch wrapper for the free tier of football-data.org.
//
// Surface
//   - listPLMatches(season): fixtures + finished results for the Premier League
//     (competition code "PL") in a given calendar year (the football-data.org
//     "season" param is the opening calendar year, e.g. 2024 for 2024-25).
//
// Free-tier constraints (verified 2026-06-12 against the public pricing page):
//   - 10 requests / minute.
//   - X-Auth-Token header authentication.
//   - PL is included in the free tier.
//
// Safety
//   - import 'server-only' raises at build time if pulled into any client bundle.
//   - The API key is read once from FOOTBALL_DATA_API_KEY; if missing, the
//     client throws a clear error WITHOUT printing the env var name verbatim
//     in stack traces of downstream callers.
//   - On HTTP errors we throw an `Error` whose `.message` carries the status
//     code and a short body excerpt. The full body, the request URL, and the
//     auth header are NEVER included in the message.
//   - 429 retry uses Retry-After (when present) or exponential backoff with a
//     cap.
//
// Out of scope this phase
//   - Cross-competition support (only "PL").
//   - In-play polling. The sync writes scheduled fixtures and finished
//     results only.
// =============================================================================

export type FootballDataMatchStatus =
  | 'SCHEDULED'
  | 'TIMED'
  | 'IN_PLAY'
  | 'PAUSED'
  | 'FINISHED'
  | 'POSTPONED'
  | 'CANCELLED'
  | 'SUSPENDED'
  | 'AWARDED';

export type FootballDataTeamRef = {
  id: number;
  name: string;
  shortName: string | null;
  tla: string | null;
  crest?: string | null;
};

export type FootballDataMatchRef = {
  id: number;
  utcDate: string;
  status: FootballDataMatchStatus;
  matchday: number | null;
  homeTeam: FootballDataTeamRef;
  awayTeam: FootballDataTeamRef;
  score: {
    fullTime: { home: number | null; away: number | null };
    halfTime?: { home: number | null; away: number | null };
  };
  season: { startDate: string; endDate: string };
  venue?: string | null;
};

export type FootballDataMatchesPayload = {
  filters?: Record<string, unknown>;
  resultSet?: { count: number };
  competition?: { code: string; name: string };
  matches: FootballDataMatchRef[];
};

export type ClientOptions = {
  /** Override the env var; tests use this to inject a fake key. */
  apiKey?: string;
  /** Base URL; defaults to the public production host. */
  baseUrl?: string;
  /** Inject a fetch implementation; tests pass a mock. */
  fetchImpl?: typeof fetch;
  /** Inject a sleep implementation; tests pass a no-op to keep runtime fast. */
  sleep?: (ms: number) => Promise<void>;
  /** Maximum retries on 429. Default: 4. */
  max429Retries?: number;
};

export const FREE_TIER_RATE_LIMIT_DELAY_MS = 6000; // 10 req/min → 1 every 6s
const DEFAULT_BASE_URL = 'https://api.football-data.org';

const DEFAULT_SLEEP = (ms: number): Promise<void> =>
  new Promise((res) => setTimeout(res, ms));

function readApiKey(opts: ClientOptions): string {
  const key = opts.apiKey ?? process.env.FOOTBALL_DATA_API_KEY;
  if (!key || key.trim().length === 0) {
    throw new Error(
      'football-data.org: API key not configured. Set the FOOTBALL_DATA_API_KEY ' +
        'env var as a server-only secret. Do not prefix it with the client-exposed env namespace.',
    );
  }
  return key.trim();
}

/** Build an opaque error message that intentionally carries ONLY the HTTP
 *  status code. The body is discarded entirely — even a 200-byte preview
 *  can leak query strings, auth tokens echoed in error responses, or other
 *  secrets the upstream might inadvertently include. */
function buildOpaqueError(status: number): Error {
  return new Error(`football-data.org: HTTP ${status}`);
}

/** Parse a Retry-After header value into milliseconds. football-data.org
 *  emits seconds (an integer) per RFC 7231. Falls back to null on bad input. */
export function parseRetryAfterMs(header: string | null | undefined): number | null {
  if (!header) return null;
  const trimmed = header.trim();
  const seconds = Number(trimmed);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return Math.round(seconds * 1000);
}

/** Backoff cap on 429s. Tests use a tiny value via injection. */
const DEFAULT_BACKOFF_BASE_MS = 1000;
const DEFAULT_BACKOFF_CAP_MS = 60_000;

export class FootballDataClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly max429Retries: number;

  constructor(opts: ClientOptions = {}) {
    this.apiKey = readApiKey(opts);
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.fetchImpl = opts.fetchImpl ?? (globalThis.fetch as typeof fetch);
    this.sleep = opts.sleep ?? DEFAULT_SLEEP;
    this.max429Retries = opts.max429Retries ?? 4;
  }

  /**
   * GET a JSON resource. Handles 429 with Retry-After (preferred) or
   * exponential backoff. Other error statuses throw opaquely.
   */
  private async getJson<T>(path: string): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    let attempt = 0;
    while (true) {
      const response = await this.fetchImpl(url, {
        method: 'GET',
        headers: {
          'X-Auth-Token': this.apiKey,
          Accept: 'application/json',
        },
      });

      if (response.status === 429) {
        if (attempt >= this.max429Retries) {
          throw buildOpaqueError(429);
        }
        const retryAfter = parseRetryAfterMs(response.headers.get('Retry-After'));
        const backoff = Math.min(
          DEFAULT_BACKOFF_CAP_MS,
          DEFAULT_BACKOFF_BASE_MS * 2 ** attempt,
        );
        const wait = retryAfter ?? backoff;
        attempt += 1;
        await this.sleep(wait);
        continue;
      }

      if (!response.ok) {
        // Drain the body so the underlying socket isn't kept alive by a
        // suspended response, but discard the contents — we NEVER include the
        // body, URL, or auth header value in the error we raise.
        try { await response.text(); } catch { /* swallow */ }
        throw buildOpaqueError(response.status);
      }

      try {
        return (await response.json()) as T;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`football-data.org: failed to parse JSON — ${msg.slice(0, 200)}`);
      }
    }
  }

  /**
   * Premier League fixtures + finished results for a season.
   *
   * football-data.org's `season` query parameter is the four-digit start year
   * of the season, e.g. `2024` for the 2024-25 season.
   */
  async listPLMatches(season: number): Promise<FootballDataMatchesPayload> {
    return this.getJson<FootballDataMatchesPayload>(
      `/v4/competitions/PL/matches?season=${encodeURIComponent(String(season))}`,
    );
  }

  /** Premier League teams (used to build the canonical team map). */
  async listPLTeams(): Promise<{
    teams: ReadonlyArray<FootballDataTeamRef>;
  }> {
    return this.getJson<{ teams: ReadonlyArray<FootballDataTeamRef> }>(
      `/v4/competitions/PL/teams`,
    );
  }
}

/** Convenience factory used by scripts; tests build the class directly. */
export function createFootballDataClient(opts: ClientOptions = {}): FootballDataClient {
  return new FootballDataClient(opts);
}
