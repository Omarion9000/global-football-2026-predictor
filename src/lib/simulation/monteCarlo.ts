import type { ScorelineProbability } from '@/lib/types';
import { poissonSample, type RNG } from '@/lib/utils';

export type MonteCarloResult = {
  teamAWinProbability: number;
  drawProbability: number;
  teamBWinProbability: number;
  topScorelines: ScorelineProbability[];
  averageGoalsTeamA: number;
  averageGoalsTeamB: number;
  iterations: number;
};

export function simulateMatch(
  rng: RNG,
  xgA: number,
  xgB: number,
): { teamAGoals: number; teamBGoals: number } {
  return {
    teamAGoals: poissonSample(rng, xgA),
    teamBGoals: poissonSample(rng, xgB),
  };
}

/**
 * Sample-based estimator for match outcomes from a fixed pair of expected
 * goals. Pure: takes a seeded RNG and returns aggregated counts. Used by the
 * engine as a sanity check on the analytic Poisson matrix and as the source of
 * truth for tournament-level rollups.
 *
 * See docs/03_MODEL_SPEC.md §6.
 */
export function runMonteCarloSimulation(
  xgA: number,
  xgB: number,
  iterations: number,
  rng: RNG,
  topN = 5,
): MonteCarloResult {
  if (iterations <= 0 || !Number.isInteger(iterations)) {
    throw new Error('runMonteCarloSimulation: iterations must be a positive integer');
  }
  if (xgA < 0 || xgB < 0) {
    throw new Error('runMonteCarloSimulation: expected goals must be non-negative');
  }

  let winsA = 0;
  let winsB = 0;
  let draws = 0;
  let sumA = 0;
  let sumB = 0;
  const counts = new Map<string, number>();

  for (let i = 0; i < iterations; i++) {
    const a = poissonSample(rng, xgA);
    const b = poissonSample(rng, xgB);
    sumA += a;
    sumB += b;
    if (a > b) winsA++;
    else if (a === b) draws++;
    else winsB++;
    const key = `${a}-${b}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const top: ScorelineProbability[] = [...counts.entries()]
    .sort((x, y) => y[1] - x[1])
    .slice(0, topN)
    .map(([key, count]) => {
      const [aStr, bStr] = key.split('-');
      return {
        teamAGoals: Number(aStr),
        teamBGoals: Number(bStr),
        probability: count / iterations,
      };
    });

  return {
    teamAWinProbability: winsA / iterations,
    drawProbability: draws / iterations,
    teamBWinProbability: winsB / iterations,
    topScorelines: top,
    averageGoalsTeamA: sumA / iterations,
    averageGoalsTeamB: sumB / iterations,
    iterations,
  };
}
