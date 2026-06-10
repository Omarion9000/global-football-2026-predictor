import type { TeamId } from './team';

export type RecentMatch = {
  /** ISO-8601 date. */
  date: string;
  opponentId: TeamId;
  /** Opponent's rating at the time of the match. */
  opponentRating: number;
  goalsFor: number;
  goalsAgainst: number;
};

export type TeamStats = {
  teamId: TeamId;
  /** Elo-style rating. V1 default starting value: 1500. */
  rating: number;
  /** Goals-for per game, time-decayed over the recent window. */
  goalsForPerGame: number;
  /** Goals-against per game, time-decayed over the recent window. */
  goalsAgainstPerGame: number;
  /** Points-per-game, time-decayed over the recent window. */
  pointsPerGame: number;
  /** Weighted average opponent rating across the recent window. */
  averageOpponentRating: number;
  /** Recent matches that produced these aggregates. Length >= 5 in mock data. */
  recentMatches: RecentMatch[];
};
