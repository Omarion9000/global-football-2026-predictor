import { describe, expect, it } from 'vitest';
import { sum } from '@/lib/utils';
import {
  generateScorelineMatrix,
  marginalProbabilities,
  topScorelines,
} from '../scorelines';
import { POISSON_MAX_GOALS } from '../version';

describe('generateScorelineMatrix', () => {
  it('produces (maxGoals + 1)^2 cells', () => {
    const m = generateScorelineMatrix(1.4, 1.1);
    expect(m).toHaveLength((POISSON_MAX_GOALS + 1) ** 2);
  });

  it('sums to approximately 1 after residual normalisation', () => {
    for (const [xgA, xgB] of [
      [0.5, 0.5],
      [1.3, 1.3],
      [2.5, 0.8],
      [3.2, 2.1],
    ]) {
      const m = generateScorelineMatrix(xgA, xgB);
      expect(sum(m.map((c) => c.probability))).toBeCloseTo(1, 6);
    }
  });

  it('contains no negative probabilities', () => {
    const m = generateScorelineMatrix(2.5, 1.0);
    for (const c of m) expect(c.probability).toBeGreaterThanOrEqual(0);
  });

  it('rejects negative xG', () => {
    expect(() => generateScorelineMatrix(-0.1, 1.0)).toThrow();
  });
});

describe('topScorelines', () => {
  it('returns N entries sorted descending by probability', () => {
    const m = generateScorelineMatrix(1.5, 1.2);
    const top = topScorelines(m, 5);
    expect(top).toHaveLength(5);
    for (let i = 1; i < top.length; i++) {
      expect(top[i - 1].probability).toBeGreaterThanOrEqual(top[i].probability);
    }
  });
});

describe('marginalProbabilities', () => {
  it('marginals sum to 1', () => {
    const m = generateScorelineMatrix(1.6, 1.0);
    const { pTeamA, pDraw, pTeamB } = marginalProbabilities(m);
    expect(pTeamA + pDraw + pTeamB).toBeCloseTo(1, 6);
  });

  it('stronger attack tilts the marginal toward team A', () => {
    const m = generateScorelineMatrix(2.5, 0.8);
    const { pTeamA, pTeamB } = marginalProbabilities(m);
    expect(pTeamA).toBeGreaterThan(pTeamB);
  });
});
