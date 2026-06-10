import type { Fixture, Team, TeamId, TeamStats } from '@/lib/types';
import { mockFixtures, mockTeams, mockTeamStats } from '@/mock';
import type { FixtureSource } from './fixtureSource';

/**
 * Default development adapter. Reads from src/mock/ only. Performs no network
 * I/O and no database I/O. Used by the engine in Phase 3+ and by Phase 6 UI
 * until a real provider is wired up in Phase 7.
 */
export class MockFixtureSource implements FixtureSource {
  async listTeams(): Promise<readonly Team[]> {
    return mockTeams;
  }

  async listFixtures(): Promise<readonly Fixture[]> {
    return mockFixtures;
  }

  async getTeamStats(teamId: TeamId): Promise<TeamStats | null> {
    return mockTeamStats[teamId] ?? null;
  }
}
