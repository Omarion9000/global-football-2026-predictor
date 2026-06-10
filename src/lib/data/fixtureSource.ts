import type { Fixture, Team, TeamId, TeamStats } from '@/lib/types';

/**
 * The adapter interface that abstracts every external fixture source.
 * Phase 2 ships only the MockFixtureSource implementation; Phase 7 adds
 * real-provider adapters behind the same interface. Engine and UI code must
 * depend on this interface, never on a concrete implementation.
 */
export interface FixtureSource {
  listTeams(): Promise<readonly Team[]>;
  listFixtures(): Promise<readonly Fixture[]>;
  getTeamStats(teamId: TeamId): Promise<TeamStats | null>;
}
