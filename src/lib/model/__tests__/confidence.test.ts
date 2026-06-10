import { describe, expect, it } from 'vitest';
import { mockFixtures, mockTeamStats } from '@/mock';
import type { PredictionInput, PredictionRunType } from '@/lib/types';
import {
  calculateConfidenceBand,
  calculateConfidenceScore,
  deriveConfidenceComponents,
} from '../confidence';
import { CONFIDENCE_BAND_THRESHOLDS } from '../version';

function buildInput(runType: PredictionRunType, overrides: Partial<PredictionInput> = {}): PredictionInput {
  const f = mockFixtures[0];
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
    runType,
    modelVersion: 'v0.1.0',
    rngSeed: 1,
    ...overrides,
  };
}

describe('calculateConfidenceScore', () => {
  it('returns a value in [0, 1]', () => {
    const s = calculateConfidenceScore({
      dataQualityScore: 0.5,
      lineupUncertainty: 0.5,
      volatilityScore: 0.5,
      probabilityGap: 0.5,
    });
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(1);
  });

  it('better data quality increases the score', () => {
    const base = calculateConfidenceScore({
      dataQualityScore: 0.0,
      lineupUncertainty: 0.5,
      volatilityScore: 0.5,
      probabilityGap: 0.3,
    });
    const better = calculateConfidenceScore({
      dataQualityScore: 1.0,
      lineupUncertainty: 0.5,
      volatilityScore: 0.5,
      probabilityGap: 0.3,
    });
    expect(better).toBeGreaterThan(base);
  });

  it('higher lineup uncertainty lowers the score', () => {
    const known = calculateConfidenceScore({
      dataQualityScore: 0.8,
      lineupUncertainty: 0.0,
      volatilityScore: 0.3,
      probabilityGap: 0.3,
    });
    const unknown = calculateConfidenceScore({
      dataQualityScore: 0.8,
      lineupUncertainty: 1.0,
      volatilityScore: 0.3,
      probabilityGap: 0.3,
    });
    expect(known).toBeGreaterThan(unknown);
  });

  it('higher volatility lowers the score', () => {
    const calm = calculateConfidenceScore({
      dataQualityScore: 0.8,
      lineupUncertainty: 0.0,
      volatilityScore: 0.0,
      probabilityGap: 0.3,
    });
    const stormy = calculateConfidenceScore({
      dataQualityScore: 0.8,
      lineupUncertainty: 0.0,
      volatilityScore: 1.0,
      probabilityGap: 0.3,
    });
    expect(calm).toBeGreaterThan(stormy);
  });
});

describe('calculateConfidenceBand', () => {
  it('classifies LOW / MEDIUM / HIGH at the threshold boundaries', () => {
    expect(calculateConfidenceBand(0)).toBe('LOW');
    expect(calculateConfidenceBand(CONFIDENCE_BAND_THRESHOLDS.lowToMedium - 0.01)).toBe('LOW');
    expect(calculateConfidenceBand(CONFIDENCE_BAND_THRESHOLDS.lowToMedium)).toBe('MEDIUM');
    expect(calculateConfidenceBand(CONFIDENCE_BAND_THRESHOLDS.mediumToHigh - 0.01)).toBe('MEDIUM');
    expect(calculateConfidenceBand(CONFIDENCE_BAND_THRESHOLDS.mediumToHigh)).toBe('HIGH');
    expect(calculateConfidenceBand(1)).toBe('HIGH');
  });
});

describe('deriveConfidenceComponents', () => {
  it('lineupUncertainty is 1.0 at T_MINUS_3H regardless of lineupAvailable', () => {
    const a = deriveConfidenceComponents(buildInput('T_MINUS_3H'), 0.4);
    const b = deriveConfidenceComponents(
      buildInput('T_MINUS_3H', { lineupAvailable: true }),
      0.4,
    );
    expect(a.lineupUncertainty).toBe(1.0);
    expect(b.lineupUncertainty).toBe(1.0);
  });

  it('lineupUncertainty drops to 0 at T_MINUS_1H when lineup is available', () => {
    const known = deriveConfidenceComponents(
      buildInput('T_MINUS_1H', { lineupAvailable: true }),
      0.4,
    );
    const missing = deriveConfidenceComponents(
      buildInput('T_MINUS_1H'),
      0.4,
    );
    expect(known.lineupUncertainty).toBe(0);
    expect(missing.lineupUncertainty).toBe(1);
  });

  it('missing optional inputs reduces dataQualityScore', () => {
    const minimal = deriveConfidenceComponents(buildInput('T_MINUS_3H'), 0.4);
    const full = deriveConfidenceComponents(
      buildInput('HT', { lineupAvailable: true, inPlayAvailable: true }),
      0.4,
    );
    expect(full.dataQualityScore).toBeGreaterThan(minimal.dataQualityScore);
  });
});
