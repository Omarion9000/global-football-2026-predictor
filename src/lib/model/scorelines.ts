import type { ScorelineProbability } from '@/lib/types';
import { poissonPmf } from '@/lib/utils';
import { DIXON_COLES_RHO, POISSON_MAX_GOALS } from './version';

export type ScorelineMarginals = {
  pTeamA: number;
  pDraw: number;
  pTeamB: number;
};

function dixonColesTau(
  i: number,
  j: number,
  lambdaA: number,
  lambdaB: number,
  rho: number,
): number {
  if (rho === 0) return 1;
  if (i === 0 && j === 0) return 1 - lambdaA * lambdaB * rho;
  if (i === 0 && j === 1) return 1 + lambdaA * rho;
  if (i === 1 && j === 0) return 1 + lambdaB * rho;
  if (i === 1 && j === 1) return 1 - rho;
  return 1;
}

/**
 * Build the full scoreline matrix using independent Poisson goal counts plus
 * the Dixon-Coles low-score correction. Cells are normalised so the truncated
 * matrix sums exactly to 1, absorbing the (>POISSON_MAX_GOALS) tail.
 *
 * See docs/03_MODEL_SPEC.md §5.
 */
export function generateScorelineMatrix(
  xgA: number,
  xgB: number,
  maxGoals: number = POISSON_MAX_GOALS,
  rho: number = DIXON_COLES_RHO,
): ScorelineProbability[] {
  if (xgA < 0 || xgB < 0) {
    throw new Error('generateScorelineMatrix: expected goals must be non-negative');
  }
  const cells: ScorelineProbability[] = [];
  let total = 0;
  for (let i = 0; i <= maxGoals; i++) {
    const pA_i = poissonPmf(xgA, i);
    for (let j = 0; j <= maxGoals; j++) {
      const pB_j = poissonPmf(xgB, j);
      const p = pA_i * pB_j * dixonColesTau(i, j, xgA, xgB, rho);
      cells.push({ teamAGoals: i, teamBGoals: j, probability: p });
      total += p;
    }
  }
  // Normalise so the truncated matrix sums to 1 (absorbs the heavy >maxGoals
  // residual into the bounded distribution).
  if (total <= 0) {
    throw new Error('generateScorelineMatrix: degenerate matrix (total <= 0)');
  }
  for (const cell of cells) cell.probability /= total;
  return cells;
}

export function topScorelines(
  matrix: readonly ScorelineProbability[],
  n: number,
): ScorelineProbability[] {
  return [...matrix]
    .sort((a, b) => b.probability - a.probability)
    .slice(0, n);
}

export function marginalProbabilities(
  matrix: readonly ScorelineProbability[],
): ScorelineMarginals {
  let pTeamA = 0;
  let pDraw = 0;
  let pTeamB = 0;
  for (const cell of matrix) {
    if (cell.teamAGoals > cell.teamBGoals) pTeamA += cell.probability;
    else if (cell.teamAGoals === cell.teamBGoals) pDraw += cell.probability;
    else pTeamB += cell.probability;
  }
  return { pTeamA, pDraw, pTeamB };
}
