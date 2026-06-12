import 'server-only';

// =============================================================================
// sync.ts — football-data.org → Neon Postgres
// =============================================================================
// Phase 8D. Pure ingestion logic — takes an API client and a sql client,
// performs idempotent upserts of teams, scheduled fixtures, and finished
// match results. No process-level concerns (env loading, exit codes); those
// live in scripts/sync-epl.ts.
//
// Write policy (V1):
//
//   API status   | mapping            | action
//   -------------|--------------------|----------------------------------------
//   SCHEDULED    | → SCHEDULED        | write fixture
//   TIMED        | → SCHEDULED        | write fixture
//   FINISHED     | → FULL_TIME        | write fixture + match_results
//   IN_PLAY      | → IN_PROGRESS      | skip (no mid-match state)
//   PAUSED       | → HALF_TIME        | skip (no mid-match state)
//   POSTPONED    | → POSTPONED        | skip with counted warning
//   CANCELLED    | → CANCELLED        | skip with counted warning
//   SUSPENDED    | (unmapped)         | HARD-FAIL
//   AWARDED      | (unmapped)         | HARD-FAIL
//   anything else| (unmapped)         | HARD-FAIL
//
// Idempotency:
//   - teams: INSERT … ON CONFLICT (id) DO NOTHING
//   - fixtures: INSERT … ON CONFLICT (id) DO NOTHING; ids are deterministic
//     epl-{YYYY-MM-DD}-{home-slug}-{away-slug}
//   - match_results: INSERT … ON CONFLICT (fixture_id) DO NOTHING
//   Re-running produces all-zero counts.
//
// Out of scope: deletes, UPDATEs, in-play state writes, multi-competition.
// =============================================================================

import type { SqlClient } from '@/lib/data/postgres/serverClient';
import { resolveApiName, dbIdFor, type CanonicalTeam } from './teamMap';
import type {
  FootballDataClient,
  FootballDataMatchRef,
  FootballDataMatchStatus,
} from './client';

export type SyncSummary = {
  /** number of distinct teams considered after API resolution */
  teamsSeen: number;
  /** rows newly inserted into teams */
  teamsInserted: number;
  /** fixtures with status SCHEDULED or TIMED actually written */
  fixturesWritten: number;
  /** fixtures with status FINISHED actually written (counted again in fixturesWritten? NO — separate) */
  finishedFixturesWritten: number;
  /** match_results rows newly inserted */
  resultsInserted: number;
  /** matches the API returned but we did not persist */
  skippedInPlay: number;
  skippedPaused: number;
  skippedPostponed: number;
  skippedCancelled: number;
  /** unmapped statuses encountered; if > 0 the sync raised before completing */
  hardFailedStatuses: ReadonlyArray<string>;
};

export type SyncOptions = {
  /** football-data.org season start year (e.g. 2024 for 2024-25). */
  season: number;
  /** dry run prints what would change but issues no INSERTs. */
  dryRun?: boolean;
};

const ALLOWED_API_STATUSES: ReadonlySet<FootballDataMatchStatus> = new Set([
  'SCHEDULED',
  'TIMED',
  'IN_PLAY',
  'PAUSED',
  'FINISHED',
  'POSTPONED',
  'CANCELLED',
]);

function classifyStatus(status: string): 'write' | 'result' | 'skip-inplay' | 'skip-paused' | 'skip-postponed' | 'skip-cancelled' | 'fail' {
  switch (status) {
    case 'SCHEDULED':
    case 'TIMED':
      return 'write';
    case 'FINISHED':
      return 'result';
    case 'IN_PLAY':
      return 'skip-inplay';
    case 'PAUSED':
      return 'skip-paused';
    case 'POSTPONED':
      return 'skip-postponed';
    case 'CANCELLED':
      return 'skip-cancelled';
    default:
      return 'fail';
  }
}

/** Deterministic fixture id derived from kickoff date and team slugs.
 *  Two calls with the same inputs produce the same id, so reruns idempotently
 *  collide on the PK. */
export function deterministicFixtureId(args: {
  utcDate: string;
  homeSlug: string;
  awaySlug: string;
}): string {
  const day = args.utcDate.slice(0, 10); // YYYY-MM-DD
  return `epl-${day}-${args.homeSlug}-${args.awaySlug}`;
}

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

async function upsertFixture(
  sql: SqlClient,
  args: {
    id: string;
    homeId: string;
    awayId: string;
    kickoffUtc: string;
    venue: string;
    status: 'SCHEDULED' | 'FULL_TIME';
  },
  dryRun: boolean,
): Promise<boolean> {
  if (dryRun) return false;
  // Venue: API gives a free-text venue when available; we have no city/country
  // info at this granularity, so we stamp 'Unknown' / 'ENG' for those.
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
      ${args.status},
      ${args.venue || 'Unknown'},
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

async function upsertResult(
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
 * Sync one season of Premier League data from football-data.org into the
 * provided sql client. Idempotent. Returns a structured summary; throws on
 * unmapped statuses BEFORE any partial write is exposed (we first scan all
 * matches for unmapped statuses and only then proceed to writes).
 */
export async function syncEplSeason(
  apiClient: FootballDataClient,
  sql: SqlClient,
  options: SyncOptions,
): Promise<SyncSummary> {
  const payload = await apiClient.listPLMatches(options.season);

  // Pass 1: validate statuses. We want hard-fail to surface BEFORE any DB
  // mutation, so a partial sync never leaves the DB in a half-written state.
  const unmapped = new Set<string>();
  for (const match of payload.matches) {
    if (!ALLOWED_API_STATUSES.has(match.status)) {
      unmapped.add(match.status);
    }
  }
  if (unmapped.size > 0) {
    const list = [...unmapped].sort().join(', ');
    throw new Error(
      `sync-epl: unmapped football-data.org status(es) [${list}]. Add explicit handling before re-running.`,
    );
  }

  // Pass 2: resolve teams + assemble distinct team set. Any unmapped API name
  // also raises immediately (teamMap.resolveApiName throws).
  const teamSet = new Map<string, CanonicalTeam>();
  for (const match of payload.matches) {
    const home = resolveApiName(match.homeTeam.name);
    const away = resolveApiName(match.awayTeam.name);
    teamSet.set(home.slug, home);
    teamSet.set(away.slug, away);
  }

  // Pass 3: upsert teams.
  let teamsInserted = 0;
  for (const team of teamSet.values()) {
    if (await upsertTeam(sql, team, options.dryRun ?? false)) teamsInserted += 1;
  }

  // Pass 4: walk matches; honour the write policy.
  let fixturesWritten = 0;
  let finishedFixturesWritten = 0;
  let resultsInserted = 0;
  let skippedInPlay = 0;
  let skippedPaused = 0;
  let skippedPostponed = 0;
  let skippedCancelled = 0;

  for (const match of payload.matches) {
    const home = resolveApiName(match.homeTeam.name);
    const away = resolveApiName(match.awayTeam.name);
    const fixtureId = deterministicFixtureId({
      utcDate: match.utcDate,
      homeSlug: home.slug,
      awaySlug: away.slug,
    });
    const action = classifyStatus(match.status);

    if (action === 'skip-inplay') {
      skippedInPlay += 1;
      continue;
    }
    if (action === 'skip-paused') {
      skippedPaused += 1;
      continue;
    }
    if (action === 'skip-postponed') {
      skippedPostponed += 1;
      continue;
    }
    if (action === 'skip-cancelled') {
      skippedCancelled += 1;
      continue;
    }

    if (action === 'write') {
      const inserted = await upsertFixture(
        sql,
        {
          id: fixtureId,
          homeId: dbIdFor(home),
          awayId: dbIdFor(away),
          kickoffUtc: match.utcDate,
          venue: match.venue ?? 'Unknown',
          status: 'SCHEDULED',
        },
        options.dryRun ?? false,
      );
      if (inserted) fixturesWritten += 1;
      continue;
    }

    if (action === 'result') {
      const homeGoals = match.score.fullTime.home;
      const awayGoals = match.score.fullTime.away;
      if (homeGoals == null || awayGoals == null) {
        // Genuinely surprising: FINISHED with null goals. Hard-fail rather
        // than silently writing 0-0.
        throw new Error(
          `sync-epl: FINISHED match ${match.id} has null score; refusing to write.`,
        );
      }
      const fInserted = await upsertFixture(
        sql,
        {
          id: fixtureId,
          homeId: dbIdFor(home),
          awayId: dbIdFor(away),
          kickoffUtc: match.utcDate,
          venue: match.venue ?? 'Unknown',
          status: 'FULL_TIME',
        },
        options.dryRun ?? false,
      );
      if (fInserted) finishedFixturesWritten += 1;
      const rInserted = await upsertResult(
        sql,
        {
          fixtureId,
          homeGoals,
          awayGoals,
          finishedAt: match.utcDate,
        },
        options.dryRun ?? false,
      );
      if (rInserted) resultsInserted += 1;
      continue;
    }

    // Should be unreachable — Pass 1 hard-failed on unmapped statuses.
    throw new Error(`sync-epl: unexpected action "${action}" for match ${match.id}`);
  }

  return {
    teamsSeen: teamSet.size,
    teamsInserted,
    fixturesWritten,
    finishedFixturesWritten,
    resultsInserted,
    skippedInPlay,
    skippedPaused,
    skippedPostponed,
    skippedCancelled,
    hardFailedStatuses: [],
  };
}
