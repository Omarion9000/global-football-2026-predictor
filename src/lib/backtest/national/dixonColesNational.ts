// =============================================================================
// dixonColesNational.ts (pure math)
// =============================================================================
// Phase 9B — national-team variant of the Phase 8B Dixon-Coles math. The ONLY
// substantive change is that the home-advantage term is gated by the match's
// `neutral` flag: a neutral-venue match contributes NO homeAdv to either side.
//
// Rate equations
//   log λᴴ = μ + (neutral ? 0 : h) + αᵢ − δⱼ
//   log λᴬ = μ + αⱼ − δᵢ
//
// The DC τ correction, the score grid, the rho clamp, and identification are
// all identical to the EPL variant in src/lib/backtest/models/dixonColes.ts
// — we re-export the shared bits (DcParams, tau, recenter, clampRho) and only
// re-implement the rate / grid pair that depends on neutral.
// =============================================================================

import {
  cloneParams,
  makeInitialParams,
  recenter,
  RHO_MAX,
  RHO_MIN,
  SCORE_MATRIX_MAX_GOALS,
  clampRho,
  tauDC,
  type DcParams,
} from '@/lib/backtest/models/dixonColes';

export {
  cloneParams,
  makeInitialParams,
  recenter,
  RHO_MAX,
  RHO_MIN,
  SCORE_MATRIX_MAX_GOALS,
  clampRho,
  tauDC,
  type DcParams,
};

/** Compute (λᴴ, λᴬ) for a single national-team match. */
export function computeRatesNational(
  params: DcParams,
  homeIdx: number,
  awayIdx: number,
  isNeutral: boolean,
): { lambdaH: number; lambdaA: number } {
  const homeAdvTerm = isNeutral ? 0 : params.homeAdv;
  const lambdaH = Math.exp(
    params.mu + homeAdvTerm + params.att[homeIdx] - params.def[awayIdx],
  );
  const lambdaA = Math.exp(
    params.mu + params.att[awayIdx] - params.def[homeIdx],
  );
  return { lambdaH, lambdaA };
}

function poissonPmf(x: number, lambda: number): number {
  if (lambda <= 0) return x === 0 ? 1 : 0;
  let logFact = 0;
  for (let k = 2; k <= x; k += 1) logFact += Math.log(k);
  return Math.exp(x * Math.log(lambda) - lambda - logFact);
}

/**
 * Score-probability matrix gated on neutrality. Otherwise identical to the
 * Phase 8B `scoreMatrix`: 11×11 grid with the DC τ correction applied on the
 * four low-score cells and the whole thing renormalised to sum to 1.
 */
export function scoreMatrixNational(
  params: DcParams,
  homeIdx: number,
  awayIdx: number,
  isNeutral: boolean,
  maxGoals = SCORE_MATRIX_MAX_GOALS,
): number[][] {
  const { lambdaH, lambdaA } = computeRatesNational(params, homeIdx, awayIdx, isNeutral);
  const home = new Array(maxGoals + 1)
    .fill(0)
    .map((_, x) => poissonPmf(x, lambdaH));
  const away = new Array(maxGoals + 1)
    .fill(0)
    .map((_, y) => poissonPmf(y, lambdaA));

  const grid: number[][] = [];
  let total = 0;
  for (let x = 0; x <= maxGoals; x += 1) {
    const row: number[] = new Array(maxGoals + 1);
    for (let y = 0; y <= maxGoals; y += 1) {
      const v = tauDC(x, y, lambdaH, lambdaA, params.rho) * home[x] * away[y];
      const safe = v > 0 ? v : 0;
      row[y] = safe;
      total += safe;
    }
    grid.push(row);
  }
  if (total <= 0) {
    const cell = 1 / ((maxGoals + 1) * (maxGoals + 1));
    for (let x = 0; x <= maxGoals; x += 1) grid[x].fill(cell);
    return grid;
  }
  for (let x = 0; x <= maxGoals; x += 1) {
    for (let y = 0; y <= maxGoals; y += 1) grid[x][y] /= total;
  }
  return grid;
}

/** Read [pH, pD, pA] from a score-probability matrix. */
export function scoreMatrixToTripleNational(
  grid: ReadonlyArray<ReadonlyArray<number>>,
): readonly [number, number, number] {
  let pH = 0;
  let pD = 0;
  let pA = 0;
  for (let x = 0; x < grid.length; x += 1) {
    for (let y = 0; y < grid[x].length; y += 1) {
      const p = grid[x][y];
      if (x > y) pH += p;
      else if (x === y) pD += p;
      else pA += p;
    }
  }
  return [pH, pD, pA] as const;
}

/** Composite helper used by the predictor. */
export function predictTripleNational(
  params: DcParams,
  homeIdx: number,
  awayIdx: number,
  isNeutral: boolean,
): readonly [number, number, number] {
  return scoreMatrixToTripleNational(
    scoreMatrixNational(params, homeIdx, awayIdx, isNeutral),
  );
}
