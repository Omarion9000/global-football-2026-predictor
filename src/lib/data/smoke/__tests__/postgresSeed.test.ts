import { describe, expect, it } from 'vitest';
import { makeMockSql } from '@/lib/data/persistence/postgres/__tests__/_mockSql';
import {
  SMOKE_STATS_CAPTURED_AT,
  SMOKE_STATS_SOURCE,
  seedMockDataForFixture,
} from '../postgresSeed';
import type { SqlClient } from '@/lib/data/postgres/serverClient';

// =============================================================================
// Functional: seedMockDataForFixture against the mock SQL helper.
// =============================================================================

describe('seedMockDataForFixture — first run (empty database)', () => {
  it('seeds two teams, one fixture, and two stats snapshots in FK-safe order', async () => {
    const sql = makeMockSql();
    // Order matches the seed implementation:
    //   team A insert  → returns 1 row (inserted)
    //   team B insert  → returns 1 row (inserted)
    //   fixture insert → returns 1 row (inserted)
    //   stats A select → returns []   (missing)
    //   stats A insert → returns []
    //   stats B select → returns []   (missing)
    //   stats B insert → returns []
    sql.enqueue([{ id: 'team-gal' }]);
    sql.enqueue([{ id: 'team-hel' }]);
    sql.enqueue([{ id: 'fixture-004' }]);
    sql.enqueue([]);
    sql.enqueue([]);
    sql.enqueue([]);
    sql.enqueue([]);

    const result = await seedMockDataForFixture(
      sql as unknown as SqlClient,
      'fixture-004',
    );

    expect(result.seededTeams).toBe(2);
    expect(result.seededFixtures).toBe(1);
    expect(result.seededStatsSnapshots).toBe(2);

    // Verify the FK dependency order is respected in the actual SQL calls.
    expect(sql.calls.length).toBe(7);
    expect(sql.calls[0].query).toMatch(/INSERT INTO teams/);
    expect(sql.calls[0].query).toMatch(/ON CONFLICT \(id\) DO NOTHING/);
    expect(sql.calls[1].query).toMatch(/INSERT INTO teams/);
    expect(sql.calls[2].query).toMatch(/INSERT INTO fixtures/);
    expect(sql.calls[2].query).toMatch(/ON CONFLICT \(id\) DO NOTHING/);
    // Stats: SELECT-then-INSERT for each team.
    expect(sql.calls[3].query).toMatch(/SELECT id FROM team_stats_snapshots/);
    expect(sql.calls[4].query).toMatch(/INSERT INTO team_stats_snapshots/);
    expect(sql.calls[5].query).toMatch(/SELECT id FROM team_stats_snapshots/);
    expect(sql.calls[6].query).toMatch(/INSERT INTO team_stats_snapshots/);
  });

  it('inserts the team IDs that match the fixture', async () => {
    const sql = makeMockSql();
    for (let i = 0; i < 7; i += 1) sql.enqueue(i < 3 ? [{ id: 'x' }] : []);

    await seedMockDataForFixture(sql as unknown as SqlClient, 'fixture-004');

    // fixture-004 = Galatea (team-gal) vs Helios (team-hel)
    expect(sql.calls[0].values).toContain('team-gal');
    expect(sql.calls[1].values).toContain('team-hel');
    expect(sql.calls[2].values).toContain('fixture-004');
    expect(sql.calls[2].values).toContain('team-gal');
    expect(sql.calls[2].values).toContain('team-hel');
  });

  it('writes stats rows under the deterministic mock-smoke source/captured_at', async () => {
    const sql = makeMockSql();
    for (let i = 0; i < 7; i += 1) sql.enqueue(i < 3 ? [{ id: 'x' }] : []);

    await seedMockDataForFixture(sql as unknown as SqlClient, 'fixture-004');

    expect(sql.calls[3].values).toContain(SMOKE_STATS_CAPTURED_AT);
    expect(sql.calls[3].values).toContain(SMOKE_STATS_SOURCE);
    expect(sql.calls[4].values).toContain(SMOKE_STATS_CAPTURED_AT);
    expect(sql.calls[4].values).toContain(SMOKE_STATS_SOURCE);
  });
});

// =============================================================================
// Idempotency: second run against the same table state.
// =============================================================================

describe('seedMockDataForFixture — idempotent re-run', () => {
  it('reports zero seeds when every row already exists', async () => {
    const sql = makeMockSql();
    // Every INSERT collides on ON CONFLICT (id) and returns [].
    // Every stats SELECT finds an existing row and skips the INSERT.
    sql.enqueue([]); // team A insert → already present
    sql.enqueue([]); // team B insert → already present
    sql.enqueue([]); // fixture insert → already present
    sql.enqueue([{ id: 'stats-a-uuid' }]); // stats A select → present
    sql.enqueue([{ id: 'stats-b-uuid' }]); // stats B select → present

    const result = await seedMockDataForFixture(
      sql as unknown as SqlClient,
      'fixture-004',
    );

    expect(result.seededTeams).toBe(0);
    expect(result.seededFixtures).toBe(0);
    expect(result.seededStatsSnapshots).toBe(0);
    // Five total calls — no stats INSERTs fired because the SELECT short-circuited.
    expect(sql.calls.length).toBe(5);
    expect(sql.calls.filter((c) => /INSERT INTO team_stats_snapshots/.test(c.query))).toHaveLength(0);
  });

  it('handles a partial-state database (teams present, stats missing)', async () => {
    const sql = makeMockSql();
    sql.enqueue([]); // team A insert → already present
    sql.enqueue([]); // team B insert → already present
    sql.enqueue([]); // fixture insert → already present
    sql.enqueue([]); // stats A select → missing
    sql.enqueue([]); // stats A insert
    sql.enqueue([]); // stats B select → missing
    sql.enqueue([]); // stats B insert

    const result = await seedMockDataForFixture(
      sql as unknown as SqlClient,
      'fixture-004',
    );

    expect(result.seededTeams).toBe(0);
    expect(result.seededFixtures).toBe(0);
    expect(result.seededStatsSnapshots).toBe(2);
  });
});

// =============================================================================
// Input validation.
// =============================================================================

describe('seedMockDataForFixture — input validation', () => {
  it('throws if the fixture is not in the mock dataset', async () => {
    const sql = makeMockSql();
    await expect(
      seedMockDataForFixture(sql as unknown as SqlClient, 'fixture-does-not-exist'),
    ).rejects.toThrow(/mock fixture "fixture-does-not-exist" not found/);
    // Crucially, no SQL was issued — failed validation does not touch the DB.
    expect(sql.calls.length).toBe(0);
  });
});

// =============================================================================
// Source-level safeguards.
// =============================================================================

describe('postgresSeed — source-level safeguards', () => {
  async function readSource(): Promise<string> {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const url = await import('node:url');
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    return fs.readFileSync(path.resolve(here, '../postgresSeed.ts'), 'utf-8');
  }

  it('imports server-only as a build-time backstop', async () => {
    const src = await readSource();
    expect(src).toMatch(/^import 'server-only'/m);
  });

  it('uses no NEXT_PUBLIC_ database env vars', async () => {
    const src = await readSource();
    expect(src).not.toMatch(/NEXT_PUBLIC_/);
  });

  it('issues no console writes', async () => {
    const src = await readSource();
    expect(src).not.toMatch(/console\.\w+\(/);
  });

  it('never references POSTGRES_URL directly (uses the injected client)', async () => {
    const src = await readSource();
    expect(src).not.toMatch(/POSTGRES_URL/);
  });
});
