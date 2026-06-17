// =============================================================================
// dixonColesConfed.ts (pure math)
// =============================================================================
// Phase 9B.2 — Dixon-Coles variant that adds a per-confederation strength
// scalar to the rate equations. Built alongside 9B's dixonColesNational.ts
// so the two can be compared head-to-head; 9B stays untouched.
//
// Rate equations
//   log λᴴ = μ + (neutral ? 0 : h) + αᵢ − δⱼ + confᶜⁱ − confᶜʲ
//   log λᴬ = μ + αⱼ − δᵢ                          + confᶜʲ − confᶜⁱ
//
//   where confᶜ is a scalar per confederation (AFC/CAF/CONCACAF/CONMEBOL/
//   OFC/UEFA) and cᵢ / cⱼ are the home/away team confederations.
//
// Identifiability
//   - α and δ are still re-centered to mean 0 after every update (same as 9B).
//   - conf[] is ALSO re-centered to mean 0 after every update.
//   - Within-confederation matches (cᵢ = cⱼ) contribute (conf[c] − conf[c]) = 0
//     to the rate so they cannot identify the confederation levels — only
//     intercontinental matches inform conf[].
//
// τ correction and the score grid are unchanged from the 9B variant; we
// re-use the shared tauDC, recenter, clampRho, and SCORE_MATRIX_MAX_GOALS
// from `dixonColes` to keep the math one source of truth.
// =============================================================================

import {
  RHO_MAX,
  RHO_MIN,
  SCORE_MATRIX_MAX_GOALS,
  clampRho,
  tauDC,
  type DcParams,
} from '@/lib/backtest/models/dixonColes';

export { RHO_MAX, RHO_MIN, SCORE_MATRIX_MAX_GOALS, clampRho, tauDC };

export type Confederation = 'AFC' | 'CAF' | 'CONCACAF' | 'CONMEBOL' | 'OFC' | 'UEFA';

export const CONFEDERATIONS: ReadonlyArray<Confederation> = [
  'AFC', 'CAF', 'CONCACAF', 'CONMEBOL', 'OFC', 'UEFA',
];

export function confederationIndex(c: Confederation): number {
  const i = CONFEDERATIONS.indexOf(c);
  if (i < 0) throw new Error(`dixonColesConfed: unknown confederation "${c}"`);
  return i;
}

/** Mutable parameter set. Extends DcParams with a confederation strength
 *  vector. `conf[k]` is the scalar for the k-th confederation in
 *  `CONFEDERATIONS` order. */
export type DcConfedParams = DcParams & {
  conf: number[];
};

/** Construct a zero-initialised parameter set for `nTeams` teams. */
export function makeInitialConfedParams(nTeams: number): DcConfedParams {
  return {
    mu: 0,
    homeAdv: 0,
    rho: 0,
    att: new Array(nTeams).fill(0),
    def: new Array(nTeams).fill(0),
    conf: new Array(CONFEDERATIONS.length).fill(0),
  };
}

export function cloneConfedParams(p: DcConfedParams): DcConfedParams {
  return {
    mu: p.mu,
    homeAdv: p.homeAdv,
    rho: p.rho,
    att: p.att.slice(),
    def: p.def.slice(),
    conf: p.conf.slice(),
  };
}

/** Re-center attack, defense, AND confederation strength to mean 0. */
export function recenterConfed(params: DcConfedParams): void {
  const n = params.att.length;
  if (n > 0) {
    let aSum = 0, dSum = 0;
    for (let i = 0; i < n; i += 1) {
      aSum += params.att[i];
      dSum += params.def[i];
    }
    const aMean = aSum / n;
    const dMean = dSum / n;
    for (let i = 0; i < n; i += 1) {
      params.att[i] -= aMean;
      params.def[i] -= dMean;
    }
  }
  const k = params.conf.length;
  if (k > 0) {
    let cSum = 0;
    for (let i = 0; i < k; i += 1) cSum += params.conf[i];
    const cMean = cSum / k;
    for (let i = 0; i < k; i += 1) params.conf[i] -= cMean;
  }
}

/** Compute (λᴴ, λᴬ) for a single match with confederation indices. */
export function computeRatesConfed(
  params: DcConfedParams,
  homeIdx: number,
  awayIdx: number,
  homeConfIdx: number,
  awayConfIdx: number,
  isNeutral: boolean,
): { lambdaH: number; lambdaA: number } {
  const homeAdvTerm = isNeutral ? 0 : params.homeAdv;
  const confH = params.conf[homeConfIdx];
  const confA = params.conf[awayConfIdx];
  const lambdaH = Math.exp(
    params.mu + homeAdvTerm + params.att[homeIdx] - params.def[awayIdx] + (confH - confA),
  );
  const lambdaA = Math.exp(
    params.mu + params.att[awayIdx] - params.def[homeIdx] + (confA - confH),
  );
  return { lambdaH, lambdaA };
}

function poissonPmf(x: number, lambda: number): number {
  if (lambda <= 0) return x === 0 ? 1 : 0;
  let logFact = 0;
  for (let k = 2; k <= x; k += 1) logFact += Math.log(k);
  return Math.exp(x * Math.log(lambda) - lambda - logFact);
}

/** Score-probability matrix for a single confed-aware match. */
export function scoreMatrixConfed(
  params: DcConfedParams,
  homeIdx: number,
  awayIdx: number,
  homeConfIdx: number,
  awayConfIdx: number,
  isNeutral: boolean,
  maxGoals = SCORE_MATRIX_MAX_GOALS,
): number[][] {
  const { lambdaH, lambdaA } = computeRatesConfed(
    params, homeIdx, awayIdx, homeConfIdx, awayConfIdx, isNeutral,
  );
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
export function scoreMatrixToTripleConfed(
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

export function predictTripleConfed(
  params: DcConfedParams,
  homeIdx: number,
  awayIdx: number,
  homeConfIdx: number,
  awayConfIdx: number,
  isNeutral: boolean,
): readonly [number, number, number] {
  return scoreMatrixToTripleConfed(
    scoreMatrixConfed(params, homeIdx, awayIdx, homeConfIdx, awayConfIdx, isNeutral),
  );
}
