import { describe, expect, it } from 'vitest';
import { makeMockSql } from '@/lib/data/persistence/postgres/__tests__/_mockSql';
import { syncEplSeason, deterministicFixtureId } from '../sync';
import type {
  FootballDataMatchRef,
  FootballDataMatchesPayload,
  FootballDataMatchStatus,
} from '../client';
import type { SqlClient } from '@/lib/data/postgres/serverClient';

function mkMatch(overrides: Partial<FootballDataMatchRef> = {}): FootballDataMatchRef {
  return {
    id: 1,
    utcDate: '2024-08-16T19:00:00Z',
    status: 'FINISHED',
    matchday: 1,
    homeTeam: { id: 66, name: 'Manchester United FC', shortName: 'Man United', tla: 'MUN' },
    awayTeam: { id: 63, name: 'Fulham FC', shortName: 'Fulham', tla: 'FUL' },
    score: { fullTime: { home: 1, away: 0 } },
    season: { startDate: '2024-08-16', endDate: '2025-05-25' },
    ...overrides,
  };
}

function fakeClient(payload: FootballDataMatchesPayload): Parameters<typeof syncEplSeason>[0] {
  return {
    listPLMatches: async () => payload,
    listPLTeams: async () => ({ teams: [] }),
  } as unknown as Parameters<typeof syncEplSeason>[0];
}

// =============================================================================
// Deterministic id
// =============================================================================

describe('deterministicFixtureId', () => {
  it('builds the canonical epl-YYYY-MM-DD-{home}-{away} pattern', () => {
    expect(
      deterministicFixtureId({
        utcDate: '2024-08-16T19:00:00Z',
        homeSlug: 'man-united',
        awaySlug: 'fulham',
      }),
    ).toBe('epl-2024-08-16-man-united-fulham');
  });
});

// =============================================================================
// Status routing
// =============================================================================

describe('syncEplSeason — write policy', () => {
  it('writes SCHEDULED fixtures, FINISHED fixtures + results, skips IN_PLAY/PAUSED, counts POSTPONED/CANCELLED', async () => {
    const matches: FootballDataMatchRef[] = [
      // SCHEDULED → write fixture
      mkMatch({ id: 1, status: 'SCHEDULED', utcDate: '2024-08-23T19:00:00Z' }),
      // TIMED → write fixture (maps to SCHEDULED)
      mkMatch({ id: 2, status: 'TIMED', utcDate: '2024-08-24T14:00:00Z' }),
      // FINISHED → write fixture + result
      mkMatch({ id: 3, status: 'FINISHED', utcDate: '2024-08-16T19:00:00Z' }),
      // IN_PLAY → skip
      mkMatch({ id: 4, status: 'IN_PLAY', utcDate: '2024-08-25T15:00:00Z' }),
      // PAUSED → skip
      mkMatch({ id: 5, status: 'PAUSED', utcDate: '2024-08-25T15:00:00Z' }),
      // POSTPONED → counted
      mkMatch({ id: 6, status: 'POSTPONED', utcDate: '2024-08-26T15:00:00Z' }),
      // CANCELLED → counted
      mkMatch({ id: 7, status: 'CANCELLED', utcDate: '2024-08-27T15:00:00Z' }),
    ];
    // Every INSERT returns a single-row "RETURNING id" array (success). The
    // sync issues:
    //   - 2 team upserts (Man United + Fulham)
    //   - 3 fixture upserts (SCHEDULED, TIMED→SCHEDULED, FINISHED)
    //   - 1 result upsert (FINISHED)
    // Order is teams → fixtures → results.
    const sql = makeMockSql();
    for (let i = 0; i < 6; i += 1) sql.enqueue([{ id: 'x' }]);
    const summary = await syncEplSeason(
      fakeClient({ matches } as FootballDataMatchesPayload),
      sql as unknown as SqlClient,
      { season: 2024 },
    );
    expect(summary.fixturesWritten).toBe(2);
    expect(summary.finishedFixturesWritten).toBe(1);
    expect(summary.resultsInserted).toBe(1);
    expect(summary.teamsInserted).toBe(2);
    expect(summary.skippedInPlay).toBe(1);
    expect(summary.skippedPaused).toBe(1);
    expect(summary.skippedPostponed).toBe(1);
    expect(summary.skippedCancelled).toBe(1);
  });

  it('hard-fails BEFORE any write on an unmapped API status', async () => {
    const matches: FootballDataMatchRef[] = [
      mkMatch({ id: 1, status: 'FINISHED' }),
      mkMatch({ id: 2, status: 'SUSPENDED' as FootballDataMatchStatus }),
    ];
    const sql = makeMockSql();
    await expect(
      syncEplSeason(
        fakeClient({ matches } as FootballDataMatchesPayload),
        sql as unknown as SqlClient,
        { season: 2024 },
      ),
    ).rejects.toThrow(/unmapped football-data.org status\(es\) \[SUSPENDED\]/);
    // Critically: zero SQL was issued — the validation pass runs first.
    expect(sql.calls.length).toBe(0);
  });

  it('hard-fails on AWARDED before any write', async () => {
    const matches: FootballDataMatchRef[] = [
      mkMatch({ id: 1, status: 'AWARDED' as FootballDataMatchStatus }),
    ];
    const sql = makeMockSql();
    await expect(
      syncEplSeason(
        fakeClient({ matches } as FootballDataMatchesPayload),
        sql as unknown as SqlClient,
        { season: 2024 },
      ),
    ).rejects.toThrow(/AWARDED/);
    expect(sql.calls.length).toBe(0);
  });

  it('hard-fails on FINISHED with null score', async () => {
    const matches: FootballDataMatchRef[] = [
      mkMatch({
        id: 1,
        status: 'FINISHED',
        score: { fullTime: { home: null, away: null } },
      }),
    ];
    const sql = makeMockSql();
    // teams upsert (2) happens before the per-match action; that's fine —
    // we have not written any fixture/result yet when we hit the null score.
    for (let i = 0; i < 2; i += 1) sql.enqueue([{ id: 'x' }]);
    await expect(
      syncEplSeason(
        fakeClient({ matches } as FootballDataMatchesPayload),
        sql as unknown as SqlClient,
        { season: 2024 },
      ),
    ).rejects.toThrow(/null score/);
  });
});

// =============================================================================
// Idempotency
// =============================================================================

describe('syncEplSeason — idempotency', () => {
  it('reports zero inserts on a second run (all ON CONFLICT collide)', async () => {
    const matches: FootballDataMatchRef[] = [
      mkMatch({ id: 1, status: 'FINISHED' }),
    ];
    const sql = makeMockSql();
    // 2 team inserts + 1 fixture insert + 1 result insert, all collide (empty).
    for (let i = 0; i < 4; i += 1) sql.enqueue([]);

    const summary = await syncEplSeason(
      fakeClient({ matches } as FootballDataMatchesPayload),
      sql as unknown as SqlClient,
      { season: 2024 },
    );
    expect(summary.teamsInserted).toBe(0);
    expect(summary.fixturesWritten).toBe(0);
    expect(summary.finishedFixturesWritten).toBe(0);
    expect(summary.resultsInserted).toBe(0);
    expect(sql.calls.length).toBe(4);
  });
});

// =============================================================================
// Dry-run
// =============================================================================

describe('syncEplSeason — dry-run', () => {
  it('issues no SQL when dryRun is true', async () => {
    const matches: FootballDataMatchRef[] = [
      mkMatch({ id: 1, status: 'SCHEDULED' }),
      mkMatch({ id: 2, status: 'FINISHED' }),
    ];
    const sql = makeMockSql();
    const summary = await syncEplSeason(
      fakeClient({ matches } as FootballDataMatchesPayload),
      sql as unknown as SqlClient,
      { season: 2024, dryRun: true },
    );
    expect(sql.calls.length).toBe(0);
    expect(summary.teamsInserted).toBe(0);
    expect(summary.fixturesWritten).toBe(0);
    expect(summary.finishedFixturesWritten).toBe(0);
    expect(summary.resultsInserted).toBe(0);
  });
});
