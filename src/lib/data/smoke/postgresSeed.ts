import 'server-only';
import type { SqlClient } from '@/lib/data/postgres/serverClient';
import { mockFixtures, mockTeamStats, mockTeams } from '@/mock';

// =============================================================================
// Postgres smoke seed
// =============================================================================
// The persistence smoke test writes a snapshot + prediction_run + scorelines
// for one mock fixture. The FK chain requires the referenced rows to exist:
//
//   teams → fixtures → data_snapshots
//                    ↑                ↑
//   team_stats_snapshots          prediction_runs → prediction_scorelines
//
// On a fresh Neon database the schema is applied but no seed rows exist, so
// the snapshot insert fails with `data_snapshots_fixture_id_fkey`.
//
// This module idempotently seeds the prerequisite rows from the mock data
// already used by `MockFixtureSource`. It is invoked by the smoke service
// only when the detected backend is `postgres` — the in-memory factory has
// no FK enforcement and needs no seeding.
//
// Strategy:
//   - teams + fixtures: INSERT … ON CONFLICT (id) DO NOTHING RETURNING id.
//     A returned row signals an actual insert; an empty result signals the row
//     was already present.
//   - team_stats_snapshots: no unique constraint exists on (team_id, captured_at,
//     source) by design, so we SELECT-then-INSERT against a fixed (captured_at,
//     source) tuple. The fixed source = `mock-smoke` keeps this clearly separate
//     from any future production stats rows.
//
// SAFETY:
//   - server-only (raises a build error if pulled into any client bundle).
//   - Never logs the connection string or any other secret.
//   - Pure INSERTs with ON CONFLICT DO NOTHING — never updates or deletes.
// =============================================================================

/** Fixed identity for smoke-test team_stats_snapshots rows. */
export const SMOKE_STATS_SOURCE = 'mock-smoke' as const;
export const SMOKE_STATS_CAPTURED_AT = '2026-06-10T00:00:00.000Z' as const;

export type SeedResult = {
  seededTeams: number;
  seededFixtures: number;
  seededStatsSnapshots: number;
};

/**
 * Seed the mock teams, fixture, and per-team stats snapshot rows required by
 * the persistence smoke test for `fixtureId`. Idempotent: re-running returns
 * counts of 0 because the ON-CONFLICT / existence-check paths skip duplicates.
 *
 * Order of inserts is fixed and matches the FK dependency graph:
 *   1. teams       (no FK dependencies)
 *   2. fixtures    (depends on teams)
 *   3. team_stats_snapshots (depends on teams)
 *
 * Throws if the fixture or either team is missing from the mock data — that
 * would mean the mock dataset has drifted and the smoke test is misconfigured.
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
    const inserted = (await sql`
      INSERT INTO teams (id, name, code, region, is_host_nation)
      VALUES (${team.id}, ${team.name}, ${team.code}, ${team.region}, false)
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `) as unknown[];
    if (inserted.length > 0) seededTeams += 1;
  }

  // 2. Fixture.
  let seededFixtures = 0;
  const fixtureInserted = (await sql`
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
  if (fixtureInserted.length > 0) seededFixtures = 1;

  // 3. Team stats snapshots. The table has no unique constraint we can hook
  // ON CONFLICT to, so we check existence against the deterministic
  // (team_id, captured_at, source) tuple and insert only if absent.
  let seededStatsSnapshots = 0;
  for (const team of [teamA, teamB]) {
    const stats = mockTeamStats[team.id];
    const existing = (await sql`
      SELECT id FROM team_stats_snapshots
      WHERE team_id = ${team.id}
        AND captured_at = ${SMOKE_STATS_CAPTURED_AT}
        AND source = ${SMOKE_STATS_SOURCE}
      LIMIT 1
    `) as unknown[];
    if (existing.length > 0) continue;

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
        ${team.id},
        ${SMOKE_STATS_CAPTURED_AT},
        ${SMOKE_STATS_SOURCE},
        ${stats.rating},
        ${stats.pointsPerGame ?? null},
        ${stats.goalsForPerGame},
        ${stats.goalsAgainstPerGame},
        ${recentMatchesJson}::jsonb
      )
    `;
    seededStatsSnapshots += 1;
  }

  return { seededTeams, seededFixtures, seededStatsSnapshots };
}
