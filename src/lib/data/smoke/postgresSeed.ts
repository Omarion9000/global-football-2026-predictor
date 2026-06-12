import 'server-only';
import type { SqlClient } from '@/lib/data/postgres/serverClient';
import { mockFixtures, mockTeamStats, mockTeams } from '@/mock';
import type { Team, Fixture, TeamStats } from '@/lib/types';

// =============================================================================
// Postgres mock seed
// =============================================================================
// Phase 7E originally seeded just the fixture-004 sub-graph so the persistence
// smoke test could write its FK-bound row. Phase 7H widens this to the full
// mock catalog (8 teams, 4 fixtures, 1 stats snapshot per team) so the public
// UI can render persisted predictions for every fixture once the cron fills
// them in.
//
// Strategy (unchanged from 7E, just iterated over the whole set):
//   - teams + fixtures: INSERT … ON CONFLICT (id) DO NOTHING RETURNING id.
//     A returned row signals an actual insert; an empty result signals the row
//     was already present.
//   - team_stats_snapshots: no unique constraint exists on (team_id,
//     captured_at, source) by design, so we SELECT-then-INSERT against a fixed
//     (captured_at, source) tuple. The fixed source = `mock-smoke` keeps these
//     clearly separate from any future production stats rows, AND lets the
//     Phase 7E rows (which already used this convention) dedupe naturally.
//
// FK order is strict and matches the dependency graph:
//   teams → fixtures → data_snapshots
//                    ↑                ↑
//   team_stats_snapshots          prediction_runs → prediction_scorelines
//
// SAFETY:
//   - server-only (raises a build error if pulled into any client bundle).
//   - Never logs the connection string or any other secret.
//   - Pure INSERTs with ON CONFLICT DO NOTHING — never updates or deletes.
// =============================================================================

/** Fixed identity for smoke / mock team_stats_snapshots rows. Reused across
 *  Phase 7E (per-fixture) and Phase 7H (full catalog) so re-runs dedupe. */
export const SMOKE_STATS_SOURCE = 'mock-smoke' as const;
export const SMOKE_STATS_CAPTURED_AT = '2026-06-10T00:00:00.000Z' as const;

export type SeedResult = {
  seededTeams: number;
  seededFixtures: number;
  seededStatsSnapshots: number;
};

async function seedTeam(sql: SqlClient, team: Team): Promise<boolean> {
  const inserted = (await sql`
    INSERT INTO teams (id, name, code, region, is_host_nation)
    VALUES (${team.id}, ${team.name}, ${team.code}, ${team.region}, false)
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  `) as unknown[];
  return inserted.length > 0;
}

async function seedFixture(sql: SqlClient, fixture: Fixture): Promise<boolean> {
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
      ${fixture.id},
      ${fixture.teamAId},
      ${fixture.teamBId},
      ${fixture.kickoffUtc},
      ${fixture.stage},
      ${fixture.groupCode ?? null},
      ${fixture.status},
      ${fixture.venue.venueName},
      ${fixture.venue.venueCity},
      ${fixture.venue.venueCountry},
      ${fixture.venue.altitudeMeters},
      ${fixture.venue.isHomeForTeamA},
      ${fixture.venue.isHomeForTeamB},
      ${fixture.restDaysTeamA},
      ${fixture.restDaysTeamB}
    )
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  `) as unknown[];
  return inserted.length > 0;
}

async function seedStatsSnapshot(
  sql: SqlClient,
  teamId: string,
  stats: TeamStats,
): Promise<boolean> {
  const existing = (await sql`
    SELECT id FROM team_stats_snapshots
    WHERE team_id = ${teamId}
      AND captured_at = ${SMOKE_STATS_CAPTURED_AT}
      AND source = ${SMOKE_STATS_SOURCE}
    LIMIT 1
  `) as unknown[];
  if (existing.length > 0) return false;

  const recentMatchesJson = JSON.stringify(stats.recentMatches);
  await sql`
    INSERT INTO team_stats_snapshots (
      team_id,
      captured_at,
      source,
      elo_rating,
      recent_form_score,
      goals_for_per_match,
      goals_against_per_match,
      recent_matches
    ) VALUES (
      ${teamId},
      ${SMOKE_STATS_CAPTURED_AT},
      ${SMOKE_STATS_SOURCE},
      ${stats.rating},
      ${stats.pointsPerGame ?? null},
      ${stats.goalsForPerGame},
      ${stats.goalsAgainstPerGame},
      ${recentMatchesJson}::jsonb
    )
  `;
  return true;
}

/**
 * Seed the full mock catalog: every team in `mockTeams`, every fixture in
 * `mockFixtures`, and one stats snapshot per team from `mockTeamStats`.
 * Idempotent — re-runs report zero everywhere because the ON-CONFLICT and
 * existence-check paths skip rows that are already present.
 *
 * FK order is strict: teams → fixtures, teams → team_stats_snapshots.
 *
 * Returns the number of *newly inserted* rows per table.
 */
export async function seedAllMockData(sql: SqlClient): Promise<SeedResult> {
  // 1. Teams.
  let seededTeams = 0;
  for (const team of mockTeams) {
    if (await seedTeam(sql, team)) seededTeams += 1;
  }

  // 2. Fixtures.
  let seededFixtures = 0;
  for (const fixture of mockFixtures) {
    if (await seedFixture(sql, fixture)) seededFixtures += 1;
  }

  // 3. Team stats snapshots, one per team.
  let seededStatsSnapshots = 0;
  for (const team of mockTeams) {
    const stats = mockTeamStats[team.id];
    if (!stats) {
      throw new Error(
        `seedAllMockData: missing mockTeamStats for team "${team.id}"`,
      );
    }
    if (await seedStatsSnapshot(sql, team.id, stats)) seededStatsSnapshots += 1;
  }

  return { seededTeams, seededFixtures, seededStatsSnapshots };
}

/**
 * Per-fixture variant retained for the persistence smoke test path. It seeds
 * exactly the rows that fixture's FK chain requires (its two teams, its row,
 * and one stats snapshot per team) — useful when a caller only cares about
 * one fixture's prerequisites and not the whole catalog. Phase 7H smoke
 * service still wires this in.
 *
 * Throws if the fixture or either team is missing from the mock data.
 */
export async function seedMockDataForFixture(
  sql: SqlClient,
  fixtureId: string,
): Promise<SeedResult> {
  const fixture = mockFixtures.find((f) => f.id === fixtureId);
  if (!fixture) {
    throw new Error(`seedMockDataForFixture: mock fixture "${fixtureId}" not found`);
  }
  const teamA = mockTeams.find((t) => t.id === fixture.teamAId);
  const teamB = mockTeams.find((t) => t.id === fixture.teamBId);
  if (!teamA || !teamB) {
    throw new Error(
      `seedMockDataForFixture: missing team for fixture "${fixtureId}" (${fixture.teamAId} / ${fixture.teamBId})`,
    );
  }
  const statsA = mockTeamStats[teamA.id];
  const statsB = mockTeamStats[teamB.id];
  if (!statsA || !statsB) {
    throw new Error(
      `seedMockDataForFixture: missing team stats for fixture "${fixtureId}" (${teamA.id} / ${teamB.id})`,
    );
  }

  // 1. Teams.
  let seededTeams = 0;
  for (const team of [teamA, teamB]) {
    if (await seedTeam(sql, team)) seededTeams += 1;
  }

  // 2. Fixture.
  const seededFixtures = (await seedFixture(sql, fixture)) ? 1 : 0;

  // 3. Per-team stats snapshots.
  let seededStatsSnapshots = 0;
  for (const team of [teamA, teamB]) {
    const stats = mockTeamStats[team.id];
    if (await seedStatsSnapshot(sql, team.id, stats)) seededStatsSnapshots += 1;
  }

  return { seededTeams, seededFixtures, seededStatsSnapshots };
}
