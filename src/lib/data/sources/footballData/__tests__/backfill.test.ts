import { describe, expect, it } from 'vitest';
import { makeMockSql } from '@/lib/data/persistence/postgres/__tests__/_mockSql';
import { backfillHistoricalCorpus } from '../backfill';
import type { HistoricalMatch } from '@/lib/data/history/parseHistoricalCsv';
import type { SqlClient } from '@/lib/data/postgres/serverClient';

function mkCorpusMatch(overrides: Partial<HistoricalMatch>): HistoricalMatch {
  return {
    season: '2024-25',
    dateIso: '2024-08-16',
    homeTeam: 'Man United',
    awayTeam: 'Fulham',
    homeGoals: 1,
    awayGoals: 0,
    ...overrides,
  };
}

// =============================================================================
// Happy path
// =============================================================================

describe('backfillHistoricalCorpus — happy path', () => {
  it('inserts every team once, every fixture once, every result once', async () => {
    const matches = [
      mkCorpusMatch({ dateIso: '2024-08-16', homeTeam: 'Man United', awayTeam: 'Fulham' }),
      mkCorpusMatch({ dateIso: '2024-08-17', homeTeam: 'Chelsea', awayTeam: 'Liverpool', homeGoals: 0, awayGoals: 2 }),
      mkCorpusMatch({ dateIso: '2024-08-18', homeTeam: 'Liverpool', awayTeam: 'Man United', homeGoals: 1, awayGoals: 1 }),
    ];
    // Distinct teams: Man United, Fulham, Chelsea, Liverpool (4) → 4 team upserts (each returns 1 row).
    // 3 fixture upserts (each returns 1 row).
    // 3 result upserts (each returns 1 row).
    const sql = makeMockSql();
    for (let i = 0; i < 4 + 3 + 3; i += 1) sql.enqueue([{ id: 'x' }]);

    const summary = await backfillHistoricalCorpus(matches, sql as unknown as SqlClient);

    expect(summary.matchesScanned).toBe(3);
    expect(summary.teamsSeen).toBe(4);
    expect(summary.teamsInserted).toBe(4);
    expect(summary.fixturesInserted).toBe(3);
    expect(summary.resultsInserted).toBe(3);
    expect(sql.calls.length).toBe(10);
    // FK order: teams first, then per-match (fixture then result).
    for (let i = 0; i < 4; i += 1) expect(sql.calls[i].query).toMatch(/INSERT INTO teams/);
    for (let i = 4; i < 10; i += 2) {
      expect(sql.calls[i].query).toMatch(/INSERT INTO fixtures/);
      expect(sql.calls[i + 1].query).toMatch(/INSERT INTO match_results/);
    }
  });

  it("uses deterministic ids that include the match date and team slugs", async () => {
    const sql = makeMockSql();
    for (let i = 0; i < 4; i += 1) sql.enqueue([{ id: 'x' }]); // 2 teams + 1 fixture + 1 result
    await backfillHistoricalCorpus(
      [mkCorpusMatch({ dateIso: '2024-08-16', homeTeam: 'Man United', awayTeam: 'Fulham' })],
      sql as unknown as SqlClient,
    );
    // Fixture INSERT carries the canonical id.
    const fixtureCall = sql.calls.find((c) => /INSERT INTO fixtures/.test(c.query))!;
    expect(fixtureCall.values).toContain('epl-2024-08-16-man-united-fulham');
  });
});

// =============================================================================
// Idempotency — re-run on a fully populated database.
// =============================================================================

describe('backfillHistoricalCorpus — idempotency', () => {
  it('reports zero inserts on a second run (every ON CONFLICT collides)', async () => {
    const matches = [
      mkCorpusMatch({ dateIso: '2024-08-16', homeTeam: 'Man United', awayTeam: 'Fulham' }),
    ];
    const sql = makeMockSql();
    // 2 team upserts + 1 fixture upsert + 1 result upsert, all return [] (collide).
    for (let i = 0; i < 4; i += 1) sql.enqueue([]);
    const summary = await backfillHistoricalCorpus(matches, sql as unknown as SqlClient);
    expect(summary.teamsInserted).toBe(0);
    expect(summary.fixturesInserted).toBe(0);
    expect(summary.resultsInserted).toBe(0);
    expect(sql.calls.length).toBe(4);
  });
});

// =============================================================================
// Hard-fail on unmapped team — must surface BEFORE any SQL is issued.
// =============================================================================

describe('backfillHistoricalCorpus — hard-fail on unmapped team', () => {
  it('throws and writes nothing when a corpus team is not in the canonical map', async () => {
    const matches = [
      mkCorpusMatch({ homeTeam: 'Some New Club' }),
    ];
    const sql = makeMockSql();
    await expect(
      backfillHistoricalCorpus(matches, sql as unknown as SqlClient),
    ).rejects.toThrow(/unmapped corpus team name "Some New Club"/);
    expect(sql.calls.length).toBe(0);
  });
});

// =============================================================================
// Dry-run.
// =============================================================================

describe('backfillHistoricalCorpus — dry-run', () => {
  it('issues no SQL but still scans every match and resolves every team', async () => {
    const matches = [
      mkCorpusMatch({ dateIso: '2024-08-16', homeTeam: 'Man United', awayTeam: 'Fulham' }),
      mkCorpusMatch({ dateIso: '2024-08-17', homeTeam: 'Chelsea', awayTeam: 'Liverpool', homeGoals: 0, awayGoals: 2 }),
    ];
    const sql = makeMockSql();
    const summary = await backfillHistoricalCorpus(matches, sql as unknown as SqlClient, { dryRun: true });
    expect(sql.calls.length).toBe(0);
    expect(summary.matchesScanned).toBe(2);
    expect(summary.teamsSeen).toBe(4);
    expect(summary.teamsInserted).toBe(0);
    expect(summary.fixturesInserted).toBe(0);
    expect(summary.resultsInserted).toBe(0);
  });
});
