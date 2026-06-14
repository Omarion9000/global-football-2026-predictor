import { describe, expect, it } from 'vitest';
import { makeMockSql } from '@/lib/data/persistence/postgres/__tests__/_mockSql';
import {
  deterministicFixtureId,
  loadInternationalCorpus,
} from '../loader';
import type { InternationalMatch } from '../parseResults';
import type { SqlClient } from '@/lib/data/postgres/serverClient';

function mk(o: Partial<InternationalMatch>): InternationalMatch {
  return {
    dateIso: '2024-06-14',
    homeTeam: 'Spain',
    awayTeam: 'Croatia',
    homeScore: 3,
    awayScore: 0,
    tournament: 'UEFA Euro',
    city: 'Berlin',
    country: 'Germany',
    neutral: true,
    ...o,
  };
}

// =============================================================================
// Deterministic id
// =============================================================================

describe('deterministicFixtureId', () => {
  it('builds the canonical intl-YYYY-MM-DD-{home}-{away} pattern', () => {
    expect(
      deterministicFixtureId({
        dateIso: '2024-06-14',
        homeSlug: 'spain',
        awaySlug: 'croatia',
      }),
    ).toBe('intl-2024-06-14-spain-croatia');
  });
});

// =============================================================================
// Happy path
// =============================================================================

describe('loadInternationalCorpus — happy path', () => {
  it('inserts every team once, every fixture once, every result once', async () => {
    const matches = [
      mk({ homeTeam: 'Spain', awayTeam: 'Croatia', dateIso: '2024-06-14', homeScore: 3, awayScore: 0 }),
      mk({ homeTeam: 'Germany', awayTeam: 'France', dateIso: '2024-06-15', homeScore: 1, awayScore: 1 }),
      mk({ homeTeam: 'Spain', awayTeam: 'Germany', dateIso: '2024-06-17', homeScore: 2, awayScore: 1 }),
    ];
    // Distinct teams: Spain, Croatia, Germany, France (4) → 4 team upserts.
    // 3 fixture upserts + 3 result upserts.
    const sql = makeMockSql();
    for (let i = 0; i < 4 + 3 + 3; i += 1) sql.enqueue([{ id: 'x' }]);

    const summary = await loadInternationalCorpus(matches, sql as unknown as SqlClient);

    expect(summary.matchesScanned).toBe(3);
    expect(summary.teamsSeen).toBe(4);
    expect(summary.teamsInserted).toBe(4);
    expect(summary.fixturesInserted).toBe(3);
    expect(summary.resultsInserted).toBe(3);
    expect(summary.distinctTournaments).toBe(1); // all UEFA Euro
    expect(sql.calls.length).toBe(10);
  });

  it('writes fixtures with stage=INTERNATIONAL, tournament=corpus value, and provenance marker', async () => {
    const sql = makeMockSql();
    for (let i = 0; i < 4; i += 1) sql.enqueue([{ id: 'x' }]); // 2 teams + 1 fixture + 1 result
    await loadInternationalCorpus(
      [mk({ homeTeam: 'Spain', awayTeam: 'Croatia', tournament: 'UEFA Euro', dateIso: '2024-06-14' })],
      sql as unknown as SqlClient,
    );
    const fixtureCall = sql.calls.find((c) => /INSERT INTO fixtures/.test(c.query))!;
    // 'INTERNATIONAL', 'FULL_TIME', and the provenance marker are SQL LITERALS
    // baked into the query text, not template-interpolated values — assert
    // against the query string rather than the `values` array.
    expect(fixtureCall.query).toMatch(/'INTERNATIONAL'/);
    expect(fixtureCall.query).toMatch(/'FULL_TIME'/);
    expect(fixtureCall.query).toMatch(/'martj42-international-results'/);
    // Template-interpolated values land in the `values` array.
    expect(fixtureCall.values).toContain('UEFA Euro');
    expect(fixtureCall.values).toContain('intl-2024-06-14-spain-croatia');
  });

  it('maps neutral=true to {is_home_for_team_a:false, is_home_for_team_b:false}', async () => {
    const sql = makeMockSql();
    for (let i = 0; i < 4; i += 1) sql.enqueue([{ id: 'x' }]);
    await loadInternationalCorpus(
      [mk({ neutral: true })],
      sql as unknown as SqlClient,
    );
    const fixtureCall = sql.calls.find((c) => /INSERT INTO fixtures/.test(c.query))!;
    // is_home_for_team_a then is_home_for_team_b. Both should be false.
    const trues = fixtureCall.values.filter((v) => v === true);
    const falses = fixtureCall.values.filter((v) => v === false);
    expect(trues.length).toBe(0);
    // 2 home flags + 1 is_host_nation (in team upserts not this call) — actually
    // for this call we want 2 false values (the two home flags).
    expect(falses.length).toBe(2);
  });

  it('maps neutral=false to {is_home_for_team_a:true, is_home_for_team_b:false}', async () => {
    const sql = makeMockSql();
    for (let i = 0; i < 4; i += 1) sql.enqueue([{ id: 'x' }]);
    await loadInternationalCorpus(
      [mk({ neutral: false })],
      sql as unknown as SqlClient,
    );
    const fixtureCall = sql.calls.find((c) => /INSERT INTO fixtures/.test(c.query))!;
    const trues = fixtureCall.values.filter((v) => v === true);
    const falses = fixtureCall.values.filter((v) => v === false);
    expect(trues.length).toBe(1); // is_home_for_team_a
    expect(falses.length).toBe(1); // is_home_for_team_b
  });
});

// =============================================================================
// Idempotency
// =============================================================================

describe('loadInternationalCorpus — idempotency', () => {
  it('reports zero inserts on a second run (every ON CONFLICT collides)', async () => {
    const matches = [mk({ dateIso: '2024-06-14', homeTeam: 'Spain', awayTeam: 'Croatia' })];
    const sql = makeMockSql();
    for (let i = 0; i < 4; i += 1) sql.enqueue([]); // 2 teams + 1 fixture + 1 result — all collide

    const summary = await loadInternationalCorpus(matches, sql as unknown as SqlClient);
    expect(summary.teamsInserted).toBe(0);
    expect(summary.fixturesInserted).toBe(0);
    expect(summary.resultsInserted).toBe(0);
  });
});

// =============================================================================
// Hard-fail on unmapped team
// =============================================================================

describe('loadInternationalCorpus — hard-fail on unmapped team', () => {
  it('throws and writes nothing when a corpus team is not in the canonical map', async () => {
    const sql = makeMockSql();
    await expect(
      loadInternationalCorpus(
        [mk({ homeTeam: 'Atlantis', awayTeam: 'Spain' })],
        sql as unknown as SqlClient,
      ),
    ).rejects.toThrow(/unmapped national team name "Atlantis"/);
    expect(sql.calls.length).toBe(0);
  });
});

// =============================================================================
// Dry-run
// =============================================================================

describe('loadInternationalCorpus — dry-run', () => {
  it('issues no SQL but still scans every match and resolves every team', async () => {
    const matches = [
      mk({ dateIso: '2024-06-14', homeTeam: 'Spain', awayTeam: 'Croatia' }),
      mk({ dateIso: '2024-06-15', homeTeam: 'Germany', awayTeam: 'France' }),
    ];
    const sql = makeMockSql();
    const summary = await loadInternationalCorpus(matches, sql as unknown as SqlClient, { dryRun: true });
    expect(sql.calls.length).toBe(0);
    expect(summary.matchesScanned).toBe(2);
    expect(summary.teamsSeen).toBe(4);
    expect(summary.teamsInserted).toBe(0);
    expect(summary.fixturesInserted).toBe(0);
    expect(summary.resultsInserted).toBe(0);
  });
});
