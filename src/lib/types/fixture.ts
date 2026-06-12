import type { TeamId } from './team';

export type FixtureId = string;

export type MatchStage =
  | 'GROUP'
  | 'R16'
  | 'QF'
  | 'SF'
  | 'F'
  | 'THIRD_PLACE'
  // LEAGUE — continuous-season league competition (e.g. English Premier League).
  // Added in 0002_add_league_stage.sql; mirrors the widened CHECK on fixtures.stage.
  // For LEAGUE rows, `groupCode` is null.
  | 'LEAGUE';

export type MatchStatus =
  | 'SCHEDULED'
  | 'PRE_MATCH'
  | 'IN_PROGRESS'
  | 'HALF_TIME'
  | 'FULL_TIME'
  | 'POSTPONED'
  | 'CANCELLED';

export type VenueContext = {
  venueName: string;
  venueCity: string;
  /** ISO 3166-1 alpha-3 country code. */
  venueCountry: string;
  /** True iff venue is in teamA's home country (host-nation advantage). */
  isHomeForTeamA: boolean;
  /** True iff venue is in teamB's home country (host-nation advantage). */
  isHomeForTeamB: boolean;
  altitudeMeters: number;
};

export type Fixture = {
  id: FixtureId;
  teamAId: TeamId;
  teamBId: TeamId;
  stage: MatchStage;
  /** Group code for GROUP-stage matches; null otherwise. */
  groupCode: string | null;
  /** Kickoff time in UTC, ISO-8601. */
  kickoffUtc: string;
  status: MatchStatus;
  venue: VenueContext;
  /** Rest days since each team's previous fixture. */
  restDaysTeamA: number;
  restDaysTeamB: number;
};
