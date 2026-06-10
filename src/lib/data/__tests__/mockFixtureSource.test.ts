import { describe, expect, it } from 'vitest';
import { MockFixtureSource } from '@/lib/data';
import {
  PREDICTION_RUN_TYPES,
  type PredictionInput,
  type PredictionRunType,
} from '@/lib/types';

describe('MockFixtureSource', () => {
  const source = new MockFixtureSource();

  it('returns at least 8 teams', async () => {
    const teams = await source.listTeams();
    expect(teams.length).toBeGreaterThanOrEqual(8);
  });

  it('returns at least 4 fixtures', async () => {
    const fixtures = await source.listFixtures();
    expect(fixtures.length).toBeGreaterThanOrEqual(4);
  });

  it('each fixture references known teams with non-empty venues', async () => {
    const teams = await source.listTeams();
    const teamIds = new Set(teams.map((t) => t.id));
    const fixtures = await source.listFixtures();

    for (const f of fixtures) {
      expect(teamIds.has(f.teamAId)).toBe(true);
      expect(teamIds.has(f.teamBId)).toBe(true);
      expect(f.teamAId).not.toBe(f.teamBId);
      expect(f.kickoffUtc).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
      expect(f.venue.venueName.length).toBeGreaterThan(0);
      expect(f.venue.venueCountry.length).toBe(3);
      expect(f.restDaysTeamA).toBeGreaterThanOrEqual(0);
      expect(f.restDaysTeamB).toBeGreaterThanOrEqual(0);
    }
  });

  it('every team has stats with at least 5 recent matches', async () => {
    const teams = await source.listTeams();
    for (const team of teams) {
      const stats = await source.getTeamStats(team.id);
      expect(stats).not.toBeNull();
      expect(stats!.recentMatches.length).toBeGreaterThanOrEqual(5);
      expect(stats!.rating).toBeGreaterThan(1000);
      expect(stats!.rating).toBeLessThan(2500);
    }
  });

  it('returns null for an unknown team id', async () => {
    expect(await source.getTeamStats('team-nonexistent')).toBeNull();
  });

  it('assembles a valid PredictionInput from mock data for every canonical runType', async () => {
    const fixtures = await source.listFixtures();
    const fixture = fixtures[0];
    const statsTeamA = await source.getTeamStats(fixture.teamAId);
    const statsTeamB = await source.getTeamStats(fixture.teamBId);
    expect(statsTeamA).not.toBeNull();
    expect(statsTeamB).not.toBeNull();

    for (const runType of PREDICTION_RUN_TYPES) {
      const input: PredictionInput = {
        fixture: {
          id: fixture.id,
          teamAId: fixture.teamAId,
          teamBId: fixture.teamBId,
          kickoffUtc: fixture.kickoffUtc,
          isHomeForTeamA: fixture.venue.isHomeForTeamA,
          isHomeForTeamB: fixture.venue.isHomeForTeamB,
          altitudeMeters: fixture.venue.altitudeMeters,
          restDaysTeamA: fixture.restDaysTeamA,
          restDaysTeamB: fixture.restDaysTeamB,
        },
        statsTeamA: statsTeamA!,
        statsTeamB: statsTeamB!,
        runType,
        modelVersion: 'v0.1.0',
        rngSeed: 42,
      };
      const valid: PredictionRunType[] = [
        'T_MINUS_3H',
        'T_MINUS_1H',
        'T_ZERO',
        'HT',
        'FT',
      ];
      expect(valid).toContain(input.runType);
    }
  });
});
