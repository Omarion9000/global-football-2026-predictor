import 'server-only';

// =============================================================================
// backfill.ts — football-data.co.uk corpus → Neon Postgres
// =============================================================================
// Phase 8D. Idempotent backfill of the Phase 8A historical corpus into the
// production schema, using the same canonical team map and deterministic
// fixture ids as the live API sync. Source-tag every row as
// `source = 'football-data-co-uk-corpus'` (in data_snapshots conceptually;
// here we just stamp the venue_name field with a marker so the row's
// provenance is greppable on the DB side).
//
// Idempotency: PK on fixtures.id (deterministic); UNIQUE on
// match_results.fixture_id. Reruns produce all-zero counts.
//
// All fixtures backfilled this way carry `stage = 'LEAGUE'` and
// `status = 'FULL_TIME'` (every corpus row is a played match). The historical
// venue_country is 'ENG' for the entire Premier League corpus.
// =============================================================================

import type { SqlClient } from '@/lib/data/postgres/serverClient';
import { dbIdFor, resolveCorpusName, type CanonicalTeam } from './teamMap';
import { deterministicFixtureId } from './sync';
import type { HistoricalMatch } from '@/lib/data/history/parseHistoricalCsv';

export type BackfillSummary = {
  matchesScanned: number;
  teamsSeen: number;
  teamsInserted: number;
  fixturesInserted: number;
  resultsInserted: number;
};

export type BackfillOptions = {
  /** Chunk size for the team upsert loop. Default 50. */
  teamChunkSize?: number;
  /** Chunk size for the fixture / result inserts. Default 200. */
  matchChunkSize?: number;
  /** Dry run skips every INSERT. */
  dryRun?: boolean;
};

async function upsertTeam(
  sql: SqlClient,
  team: CanonicalTeam,
  dryRun: boolean,
): Promise<boolean> {
  if (dryRun) return false;
  const inserted = (await sql`
    INSERT INTO teams (id, name, code, region, is_host_nation)
    VALUES (${dbIdFor(team)}, ${team.displayName}, ${team.tla}, 'UEFA', false)
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  `) as unknown[];
  return inserted.length > 0;
}

async function upsertHistoricalFixture(
  sql: SqlClient,
  args: {
    id: string;
    homeId: string;
    awayId: string;
    kickoffUtc: string;
  },
  dryRun: boolean,
): Promise<boolean> {
  if (dryRun) return false;
  const inserted = (await sql`
    INSERT INTO fixtures (
      id,
      team_a_id,
      team_b_id,
      kickoff_utc,
      stage,
      group_code,
      status,
      venue_name,
      venue_city,
      venue_country,
      venue_altitude_meters,
      is_home_for_team_a,
      is_home_for_team_b,
      rest_days_team_a,
      rest_days_team_b
    ) VALUES (
      ${args.id},
      ${args.homeId},
      ${args.awayId},
      ${args.kickoffUtc},
      'LEAGUE',
      ${null},
      'FULL_TIME',
      'football-data-co-uk-corpus',
      'Unknown',
      'ENG',
      0,
      true,
      false,
      0,
      0
    )
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  `) as unknown[];
  return inserted.length > 0;
}

async function upsertHistoricalResult(
  sql: SqlClient,
  args: {
    fixtureId: string;
    homeGoals: number;
    awayGoals: number;
    finishedAt: string;
  },
  dryRun: boolean,
): Promise<boolean> {
  if (dryRun) return false;
  const inserted = (await sql`
    INSERT INTO match_results (
      fixture_id,
      team_a_goals,
      team_b_goals,
      status,
      finished_at
    ) VALUES (
      ${args.fixtureId},
      ${args.homeGoals},
      ${args.awayGoals},
      'FULL_TIME',
      ${args.finishedAt}
    )
    ON CONFLICT (fixture_id) DO NOTHING
    RETURNING id
  `) as unknown[];
  return inserted.length > 0;
}

/**
 * Idempotently backfill a HistoricalMatch[] corpus into the production
 * schema. The caller is responsible for loading the corpus and providing
 * the sql client.
 */
export async function backfillHistoricalCorpus(
  matches: ReadonlyArray<HistoricalMatch>,
  sql: SqlClient,
  options: BackfillOptions = {},
): Promise<BackfillSummary> {
  const dryRun = options.dryRun ?? false;

  // Resolve every team upfront — a single unmapped name should halt the
  // whole backfill before any partial write.
  const teamSet = new Map<string, CanonicalTeam>();
  for (const m of matches) {
    const home = resolveCorpusName(m.homeTeam);
    const away = resolveCorpusName(m.awayTeam);
    teamSet.set(home.slug, home);
    teamSet.set(away.slug, away);
  }

  // Upsert teams.
  let teamsInserted = 0;
  for (const team of teamSet.values()) {
    if (await upsertTeam(sql, team, dryRun)) teamsInserted += 1;
  }

  // Walk matches; the chunk sizes are advisory — we issue one INSERT per
  // row but the Neon HTTP driver pipelines well enough that 3,800 rows
  // complete in single-digit seconds. Logging is summary-only.
  let fixturesInserted = 0;
  let resultsInserted = 0;

  for (const m of matches) {
    const home = resolveCorpusName(m.homeTeam);
    const away = resolveCorpusName(m.awayTeam);
    const utcDate = `${m.dateIso}T15:00:00.000Z`; // historical UTC midpoint — kickoff time not in corpus
    const fixtureId = deterministicFixtureId({
      utcDate,
      homeSlug: home.slug,
      awaySlug: away.slug,
    });
    if (
      await upsertHistoricalFixture(
        sql,
        {
          id: fixtureId,
          homeId: dbIdFor(home),
          awayId: dbIdFor(away),
          kickoffUtc: utcDate,
        },
        dryRun,
      )
    ) {
      fixturesInserted += 1;
    }
    if (
      await upsertHistoricalResult(
        sql,
        {
          fixtureId,
          homeGoals: m.homeGoals,
          awayGoals: m.awayGoals,
          finishedAt: utcDate,
        },
        dryRun,
      )
    ) {
      resultsInserted += 1;
    }
  }

  return {
    matchesScanned: matches.length,
    teamsSeen: teamSet.size,
    teamsInserted,
    fixturesInserted,
    resultsInserted,
  };
}
