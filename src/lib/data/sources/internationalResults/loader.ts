import 'server-only';

// =============================================================================
// loader.ts — martj42 corpus → Neon Postgres
// =============================================================================
// Phase 9A. Pure ingestion logic. Idempotent upserts of:
//   - national teams (one row per CanonicalNation seen in the filtered corpus)
//   - international fixtures (stage='INTERNATIONAL', tournament=corpus value)
//   - match_results (status='FULL_TIME')
//
// Idempotency:
//   - teams: INSERT … ON CONFLICT (id) DO NOTHING
//   - fixtures: INSERT … ON CONFLICT (id) DO NOTHING; ids are deterministic
//     intl-{YYYY-MM-DD}-{home-slug}-{away-slug}
//   - match_results: INSERT … ON CONFLICT (fixture_id) DO NOTHING
//
// Provenance: every fixture row carries venue_name='martj42-international-results'
// — a greppable marker mirroring the EPL backfill's 'football-data-co-uk-corpus'.
//
// Neutral handling per W0 audit:
//   - neutral=true  → {is_home_for_team_a: false, is_home_for_team_b: false}
//   - neutral=false → {is_home_for_team_a: true,  is_home_for_team_b: false}
// =============================================================================

import type { SqlClient } from '@/lib/data/postgres/serverClient';
import {
  CANONICAL_NATIONS,
  dbIdFor,
  resolveNation,
  type CanonicalNation,
} from './teamMap';
import type { InternationalMatch } from './parseResults';

export type LoaderSummary = {
  matchesScanned: number;
  teamsSeen: number;
  teamsInserted: number;
  fixturesInserted: number;
  resultsInserted: number;
  distinctTournaments: number;
  /** Per-tournament match counts in the (filtered, valid) set. Order is
   *  sorted ASC by tournament name for deterministic dumping. */
  byTournament: Record<string, number>;
  /** In dry-run mode, the would-insert count differs from fixturesInserted
   *  (which stays 0 because we issue no SQL). In real mode, the two values
   *  match on the first run and are 0 on a re-run. */
  wouldInsertFixtures: number;
};

export type LoaderOptions = {
  /** Dry run skips every INSERT. */
  dryRun?: boolean;
  /** Progress callback invoked every N processed matches. */
  onProgress?: (processed: number, total: number) => void;
  /** Frequency of the progress callback. Default: 500. */
  progressEvery?: number;
};

const HISTORICAL_KICKOFF_TIME_UTC = '15:00:00.000Z';

/** Deterministic fixture id derived from kickoff date and team slugs. */
export function deterministicFixtureId(args: {
  dateIso: string;
  homeSlug: string;
  awaySlug: string;
}): string {
  return `intl-${args.dateIso}-${args.homeSlug}-${args.awaySlug}`;
}

async function upsertTeam(
  sql: SqlClient,
  team: CanonicalNation,
  dryRun: boolean,
): Promise<boolean> {
  if (dryRun) return false;
  const inserted = (await sql`
    INSERT INTO teams (id, name, code, region, is_host_nation)
    VALUES (${dbIdFor(team)}, ${team.displayName}, ${team.code}, ${team.confederation}, false)
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
    tournament: string;
    city: string;
    country: string;
    neutral: boolean;
  },
  dryRun: boolean,
): Promise<boolean> {
  if (dryRun) return false;
  // Neutral mapping per W0 audit:
  //   neutral=true  → both home flags false
  //   neutral=false → team_a is home, team_b away
  const isHomeForTeamA = !args.neutral;
  const isHomeForTeamB = false;
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
      rest_days_team_b,
      tournament
    ) VALUES (
      ${args.id},
      ${args.homeId},
      ${args.awayId},
      ${args.kickoffUtc},
      'INTERNATIONAL',
      ${null},
      'FULL_TIME',
      'martj42-international-results',
      ${args.city || 'Unknown'},
      ${args.country || 'Unknown'},
      0,
      ${isHomeForTeamA},
      ${isHomeForTeamB},
      0,
      0,
      ${args.tournament}
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
 * Idempotently load a filtered InternationalMatch[] corpus into the production
 * schema. Resolves every team via the canonical map upfront — a single
 * unmapped team halts the whole load before any partial write.
 */
export async function loadInternationalCorpus(
  matches: ReadonlyArray<InternationalMatch>,
  sql: SqlClient,
  options: LoaderOptions = {},
): Promise<LoaderSummary> {
  const dryRun = options.dryRun ?? false;
  const progressEvery = options.progressEvery ?? 500;

  // Resolve teams upfront: any unmapped corpus name throws before SQL is issued.
  const teamSet = new Map<string, CanonicalNation>();
  for (const m of matches) {
    const home = resolveNation(m.homeTeam);
    const away = resolveNation(m.awayTeam);
    teamSet.set(home.slug, home);
    teamSet.set(away.slug, away);
  }

  // Per-tournament match counter (for the summary + dry-run reconciliation).
  const tournamentCounts = new Map<string, number>();
  for (const m of matches) {
    tournamentCounts.set(m.tournament, (tournamentCounts.get(m.tournament) ?? 0) + 1);
  }

  // Upsert teams.
  let teamsInserted = 0;
  for (const team of teamSet.values()) {
    if (await upsertTeam(sql, team, dryRun)) teamsInserted += 1;
  }

  // Walk matches.
  let fixturesInserted = 0;
  let resultsInserted = 0;
  const total = matches.length;
  let processed = 0;

  for (const m of matches) {
    const home = resolveNation(m.homeTeam);
    const away = resolveNation(m.awayTeam);
    const utcDate = `${m.dateIso}T${HISTORICAL_KICKOFF_TIME_UTC}`;
    const fixtureId = deterministicFixtureId({
      dateIso: m.dateIso,
      homeSlug: home.slug,
      awaySlug: away.slug,
    });
    if (
      await upsertFixture(
        sql,
        {
          id: fixtureId,
          homeId: dbIdFor(home),
          awayId: dbIdFor(away),
          kickoffUtc: utcDate,
          tournament: m.tournament,
          city: m.city,
          country: m.country,
          neutral: m.neutral,
        },
        dryRun,
      )
    ) {
      fixturesInserted += 1;
    }
    if (
      await upsertResult(
        sql,
        {
          fixtureId,
          homeGoals: m.homeScore,
          awayGoals: m.awayScore,
          finishedAt: utcDate,
        },
        dryRun,
      )
    ) {
      resultsInserted += 1;
    }
    processed += 1;
    if (options.onProgress && processed % progressEvery === 0) {
      options.onProgress(processed, total);
    }
  }
  if (options.onProgress) options.onProgress(processed, total);

  // Sanity: every canonical nation we saw should still be in our map.
  for (const seen of teamSet.values()) {
    if (!CANONICAL_NATIONS.some((c) => c.slug === seen.slug)) {
      throw new Error(`loader: drift detected — team "${seen.slug}" no longer in canonical map`);
    }
  }

  const byTournament: Record<string, number> = {};
  for (const t of [...tournamentCounts.keys()].sort()) {
    byTournament[t] = tournamentCounts.get(t)!;
  }
  return {
    matchesScanned: matches.length,
    teamsSeen: teamSet.size,
    teamsInserted,
    fixturesInserted,
    resultsInserted,
    distinctTournaments: tournamentCounts.size,
    byTournament,
    wouldInsertFixtures: matches.length,
  };
}
