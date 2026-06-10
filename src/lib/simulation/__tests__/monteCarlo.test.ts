import { describe, expect, it } from 'vitest';
import { makeRNG } from '@/lib/utils';
import {
  generateScorelineMatrix,
  marginalProbabilities,
} from '@/lib/model/scorelines';
import { runMonteCarloSimulation, simulateMatch } from '../monteCarlo';

describe('simulateMatch', () => {
  it('returns non-negative integer goal counts', () => {
    const rng = makeRNG(1);
    for (let i = 0; i < 50; i++) {
      const { teamAGoals, teamBGoals } = simulateMatch(rng, 1.5, 1.2);
      expect(Number.isInteger(teamAGoals)).toBe(true);
      expect(Number.isInteger(teamBGoals)).toBe(true);
      expect(teamAGoals).toBeGreaterThanOrEqual(0);
      expect(teamBGoals).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('runMonteCarloSimulation', () => {
  it('outcome probabilities sum to 1', () => {
    const rng = makeRNG(123);
    const r = runMonteCarloSimulation(1.4, 1.1, 2000, rng);
    expect(r.teamAWinProbability + r.drawProbability + r.teamBWinProbability)
      .toBeCloseTo(1, 6);
  });

  it('is deterministic for the same seed and iteration count', () => {
    const a = runMonteCarloSimulation(1.8, 1.0, 1000, makeRNG(7));
    const b = runMonteCarloSimulation(1.8, 1.0, 1000, makeRNG(7));
    expect(a).toEqual(b);
  });

  it('topScorelines are sorted descending and bounded by topN', () => {
    const r = runMonteCarloSimulation(2.2, 1.5, 5000, makeRNG(11), 5);
    expect(r.topScorelines.length).toBeLessThanOrEqual(5);
    for (let i = 1; i < r.topScorelines.length; i++) {
      expect(r.topScorelines[i - 1].probability).toBeGreaterThanOrEqual(
        r.topScorelines[i].probability,
      );
    }
  });

  it('average goals approximate the lambdas', () => {
    const r = runMonteCarloSimulation(1.5, 0.8, 8000, makeRNG(33));
    expect(r.averageGoalsTeamA).toBeCloseTo(1.5, 1);
    expect(r.averageGoalsTeamB).toBeCloseTo(0.8, 1);
  });

  it('converges to the analytic Poisson marginals within 1.5% at N = 10_000', () => {
    const xgA = 1.4;
    const xgB = 1.1;
    const matrix = generateScorelineMatrix(xgA, xgB);
    const analytic = marginalProbabilities(matrix);
    const mc = runMonteCarloSimulation(xgA, xgB, 10_000, makeRNG(2025));
    const tol = 0.015;
    expect(Math.abs(mc.teamAWinProbability - analytic.pTeamA)).toBeLessThan(tol);
    expect(Math.abs(mc.drawProbability - analytic.pDraw)).toBeLessThan(tol);
    expect(Math.abs(mc.teamBWinProbability - analytic.pTeamB)).toBeLessThan(tol);
  });

  it('rejects bad inputs', () => {
    expect(() => runMonteCarloSimulation(1, 1, 0, makeRNG(1))).toThrow();
    expect(() => runMonteCarloSimulation(-1, 1, 100, makeRNG(1))).toThrow();
  });
});
