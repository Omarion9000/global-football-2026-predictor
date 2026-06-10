import { describe, expect, it } from 'vitest';
import { mockFixtures, mockTeamStats } from '@/mock';
import {
  MissingInputError,
  PREDICTION_RUN_TYPES,
  type PredictionInput,
  type PredictionRunType,
} from '@/lib/types';
import { predictMatch } from '../predict';
import { MODEL_VERSION, XG_MAX, XG_MIN } from '../version';

function buildInput(
  fixtureIndex: number,
  runType: PredictionRunType,
  extras: Partial<PredictionInput> = {},
): PredictionInput {
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
    runType,
    modelVersion: MODEL_VERSION,
    rngSeed: 42,
    ...extras,
  };
}

describe('predictMatch — happy path across all mock fixtures × all run types', () => {
  it('predicts every mock fixture for every canonical runType', () => {
    for (let i = 0; i < mockFixtures.length; i++) {
      for (const runType of PREDICTION_RUN_TYPES) {
        const out = predictMatch(buildInput(i, runType, {
          // make optional inputs available for runs that expect them so we
          // don't accumulate noisy warnings in the happy path
          lineupAvailable: runType !== 'T_MINUS_3H',
          inPlayAvailable: runType === 'HT' || runType === 'FT',
        }), { iterations: 1500 });

        expect(out.modelVersion).toBe(MODEL_VERSION);
        expect(out.topScorelines.length).toBeGreaterThan(0);

        // Marginals sum to 1
        expect(
          out.teamAWinProbability + out.drawProbability + out.teamBWinProbability,
        ).toBeCloseTo(1, 6);

        // xG within clamp window
        expect(out.teamAExpectedGoals).toBeGreaterThanOrEqual(XG_MIN);
        expect(out.teamAExpectedGoals).toBeLessThanOrEqual(XG_MAX);
        expect(out.teamBExpectedGoals).toBeGreaterThanOrEqual(XG_MIN);
        expect(out.teamBExpectedGoals).toBeLessThanOrEqual(XG_MAX);

        // Confidence bounded and banded consistently
        expect(out.confidenceScore).toBeGreaterThanOrEqual(0);
        expect(out.confidenceScore).toBeLessThanOrEqual(1);
        expect(['LOW', 'MEDIUM', 'HIGH']).toContain(out.confidenceBand);

        // Warnings exist as an array (engine never logs to console)
        expect(Array.isArray(out.warnings)).toBe(true);
      }
    }
  });

  it('is deterministic for identical input + seed', () => {
    const input = buildInput(0, 'T_ZERO', { lineupAvailable: true });
    const a = predictMatch(input, { iterations: 1500 });
    const b = predictMatch(input, { iterations: 1500 });
    expect(a).toEqual(b);
  });

  it('surfaces a lineup warning when T_MINUS_1H has no lineup', () => {
    const out = predictMatch(buildInput(0, 'T_MINUS_1H'), { iterations: 500 });
    expect(out.warnings.some((w) => w.includes('lineup'))).toBe(true);
  });

  it('surfaces an in-play warning when HT has no in-play data', () => {
    const out = predictMatch(buildInput(0, 'HT'), { iterations: 500 });
    expect(out.warnings.some((w) => w.includes('in-play'))).toBe(true);
  });
});

describe('predictMatch — input validation', () => {
  it('throws MissingInputError when statsTeamA is missing', () => {
    const bad = buildInput(0, 'T_MINUS_3H');
    delete (bad as Partial<PredictionInput>).statsTeamA;
    expect(() => predictMatch(bad as PredictionInput)).toThrow(MissingInputError);
  });

  it('throws MissingInputError when runType is invalid', () => {
    const bad = buildInput(0, 'T_MINUS_3H');
    (bad as { runType: string }).runType = 'BOGUS';
    expect(() => predictMatch(bad as PredictionInput)).toThrow(MissingInputError);
  });

  it('throws MissingInputError when rngSeed is not a number', () => {
    const bad = buildInput(0, 'T_MINUS_3H');
    (bad as { rngSeed: unknown }).rngSeed = 'oops';
    expect(() => predictMatch(bad as PredictionInput)).toThrow(MissingInputError);
  });

  it('thrown MissingInputError carries the missing fields list', () => {
    const bad = buildInput(0, 'T_MINUS_3H');
    delete (bad as Partial<PredictionInput>).statsTeamA;
    delete (bad as Partial<PredictionInput>).statsTeamB;
    try {
      predictMatch(bad as PredictionInput);
      expect.fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(MissingInputError);
      const missing = (err as MissingInputError).missingFields;
      expect(missing).toContain('statsTeamA');
      expect(missing).toContain('statsTeamB');
    }
  });
});

describe('predictMatch — engine purity', () => {
  it('predict.ts source contains no console.log', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(
      new URL('../predict.ts', import.meta.url),
      'utf-8',
    );
    expect(src).not.toMatch(/console\.\w+\(/);
  });
});
