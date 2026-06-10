import { describe, expect, it } from 'vitest';
import { mockFixtures, mockTeamStats } from '@/mock';
import type { PredictionInput } from '@/lib/types';
import { calculateExpectedGoals } from '../expectedGoals';
import { XG_MAX, XG_MIN } from '../version';

function buildInput(fixtureIndex = 0): PredictionInput {
  const f = mockFixtures[fixtureIndex];
  return {
    fixture: {
      id: f.id,
      teamAId: f.teamAId,
      teamBId: f.teamBId,
      kickoffUtc: f.kickoffUtc,
      isHomeForTeamA: f.venue.isHomeForTeamA,
      isHomeForTeamB: f.venue.isHomeForTeamB,
      altitudeMeters: f.venue.altitudeMeters,
      restDaysTeamA: f.restDaysTeamA,
      restDaysTeamB: f.restDaysTeamB,
    },
    statsTeamA: mockTeamStats[f.teamAId],
    statsTeamB: mockTeamStats[f.teamBId],
    runType: 'T_MINUS_3H',
    modelVersion: 'v0.1.0',
    rngSeed: 1,
  };
}

describe('calculateExpectedGoals', () => {
  it('returns positive values clamped to [XG_MIN, XG_MAX]', () => {
    for (let i = 0; i < mockFixtures.length; i++) {
      const { xgA, xgB } = calculateExpectedGoals(buildInput(i));
      expect(xgA).toBeGreaterThanOrEqual(XG_MIN);
      expect(xgA).toBeLessThanOrEqual(XG_MAX);
      expect(xgB).toBeGreaterThanOrEqual(XG_MIN);
      expect(xgB).toBeLessThanOrEqual(XG_MAX);
    }
  });

  it('produces reasonable mid-range xG for moderate matchups', () => {
    // First mock fixture is Aurelia (strong) vs Bellatrix (also strong).
    const { xgA, xgB } = calculateExpectedGoals(buildInput(0));
    expect(xgA + xgB).toBeGreaterThan(1.0);
    expect(xgA + xgB).toBeLessThan(6.0);
  });

  it('stronger attack vs weaker defence increases the attacking side xG', () => {
    // Fixture index 3: Galatea (mid) vs Helios (weak defence). Galatea should
    // post more xG than Helios.
    const { xgA, xgB } = calculateExpectedGoals(buildInput(3));
    expect(xgA).toBeGreaterThan(xgB);
  });

  it('host-nation flag amplifies that side\'s xG', () => {
    const base = buildInput(0);
    const withHostA = {
      ...base,
      fixture: { ...base.fixture, isHomeForTeamA: true },
    };
    const baseline = calculateExpectedGoals(base);
    const lifted = calculateExpectedGoals(withHostA);
    expect(lifted.xgA).toBeGreaterThan(baseline.xgA);
  });

  it('high altitude reduces both xG values', () => {
    const base = buildInput(0);
    const highAlt = {
      ...base,
      fixture: { ...base.fixture, altitudeMeters: 3000 },
    };
    const baseline = calculateExpectedGoals(base);
    const thin = calculateExpectedGoals(highAlt);
    expect(thin.xgA).toBeLessThan(baseline.xgA);
    expect(thin.xgB).toBeLessThan(baseline.xgB);
  });
});
