// =============================================================================
// dixonColes.ts (pure math)
// =============================================================================
// Phase 8B — Dixon-Coles low-score-corrected bivariate Poisson model. Pure
// functions only; no I/O, no mutable globals. Fitting lives in dcFit.ts; this
// file is the rate / probability layer the predictor and the fitter share.
//
// Notation
//   N = number of teams in the model. Teams are referenced by index i ∈ [0, N).
//   λᴴ(i,j) = exp( μ + h + αᵢ − δⱼ )           (home team i, away team j)
//   λᴬ(i,j) = exp( μ + αⱼ − δᵢ )
//   τ(x,y; λᴴ, λᴬ, ρ) = Dixon-Coles low-score correction (cells 0..1)
//   P(x,y) ∝ τ(x,y) · Pois(x; λᴴ) · Pois(y; λᴬ)
//
// Identification: mean(α) = 0 and mean(δ) = 0. The fitter re-centers after
// each update so the parameters remain identifiable.
//
// The DC τ multiplies the independent-Poisson cell probability on the four
// low-score cells; everywhere else τ = 1. The form pinned here is the
// canonical 1997 specification.
//
// Production model lives at src/lib/model/ and is byte-identical (Phase 8B
// guardrail). This file is consumed only by backtest code paths.
// =============================================================================

/** Mutable parameter set. Arrays are indexed by team index.
 *  `att` and `def` must be re-centered (mean 0) after any update. */
export type DcParams = {
  mu: number;
  homeAdv: number;
  rho: number;
  att: number[];
  def: number[];
};

/** Construct a zero-initialised parameter set for `nTeams` teams. */
export function makeInitialParams(nTeams: number): DcParams {
  return {
    mu: 0,
    homeAdv: 0,
    rho: 0,
    att: new Array(nTeams).fill(0),
    def: new Array(nTeams).fill(0),
  };
}

/** Deep clone — used by the fitter to keep an immutable warm-start baseline
 *  separate from the iterated state. */
export function cloneParams(p: DcParams): DcParams {
  return {
    mu: p.mu,
    homeAdv: p.homeAdv,
    rho: p.rho,
    att: p.att.slice(),
    def: p.def.slice(),
  };
}

/** Compute (λᴴ, λᴬ) for a single match. */
export function computeRates(
  params: DcParams,
  homeIdx: number,
  awayIdx: number,
): { lambdaH: number; lambdaA: number } {
  const lambdaH = Math.exp(
    params.mu + params.homeAdv + params.att[homeIdx] - params.def[awayIdx],
  );
  const lambdaA = Math.exp(
    params.mu + params.att[awayIdx] - params.def[homeIdx],
  );
  return { lambdaH, lambdaA };
}

/**
 * Dixon-Coles 1997 low-score correction.
 *
 *   τ(0,0) = 1 − λᴴ·λᴬ·ρ
 *   τ(1,0) = 1 + λᴬ·ρ
 *   τ(0,1) = 1 + λᴴ·ρ
 *   τ(1,1) = 1 − ρ
 *   τ(x,y) = 1  otherwise
 *
 * For ρ = 0 the correction collapses to 1 everywhere (independent Poisson).
 */
export function tauDC(
  x: number,
  y: number,
  lambdaH: number,
  lambdaA: number,
  rho: number,
): number {
  if (x === 0 && y === 0) return 1 - lambdaH * lambdaA * rho;
  if (x === 1 && y === 0) return 1 + lambdaA * rho;
  if (x === 0 && y === 1) return 1 + lambdaH * rho;
  if (x === 1 && y === 1) return 1 - rho;
  return 1;
}

/** Single-event Poisson probability mass at integer x ≥ 0. */
function poissonPmf(x: number, lambda: number): number {
  // Compute via exp(x·log λ − λ − log(x!)) for numerical stability.
  if (lambda <= 0) return x === 0 ? 1 : 0;
  let logFact = 0;
  for (let k = 2; k <= x; k += 1) logFact += Math.log(k);
  return Math.exp(x * Math.log(lambda) - lambda - logFact);
}

export const SCORE_MATRIX_MAX_GOALS = 10;

/**
 * Build the (max+1) × (max+1) score-probability matrix, normalised to sum 1.
 *
 * `result[x][y]` is P(home scores x, away scores y) after applying the DC
 * correction and renormalising over the truncated grid.
 */
export function scoreMatrix(
  params: DcParams,
  homeIdx: number,
  awayIdx: number,
  maxGoals = SCORE_MATRIX_MAX_GOALS,
): number[][] {
  const { lambdaH, lambdaA } = computeRates(params, homeIdx, awayIdx);
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
      // Numerical safety: τ can be slightly negative inside the gradient ascent
      // step if ρ wanders outside the per-match feasible region. Clip to 0 so
      // the renormalised probability mass stays valid.
      const safe = v > 0 ? v : 0;
      row[y] = safe;
      total += safe;
    }
    grid.push(row);
  }
  if (total <= 0) {
    // Degenerate fall-through: return a uniform grid. Only reachable if the
    // numerical clip above wiped every cell, which the fitter's ρ clamp
    // prevents in practice.
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
export function scoreMatrixToTriple(
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

/** Composite helper used by the predictor — rates + grid + marginals. */
export function predictTriple(
  params: DcParams,
  homeIdx: number,
  awayIdx: number,
): readonly [number, number, number] {
  return scoreMatrixToTriple(scoreMatrix(params, homeIdx, awayIdx));
}

/** Re-center attack and defense so each has mean 0 (identification). */
export function recenter(params: DcParams): void {
  const n = params.att.length;
  if (n === 0) return;
  let aSum = 0;
  let dSum = 0;
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

/** Default safe range for ρ; covers the typical fitted-Premier-League value. */
export const RHO_MIN = -0.2;
export const RHO_MAX = 0.1;

/** Clamp ρ into a globally safe band — keeps τ positive across the corpus
 *  even on extreme (λᴴ·λᴬ) products. */
export function clampRho(rho: number): number {
  if (rho < RHO_MIN) return RHO_MIN;
  if (rho > RHO_MAX) return RHO_MAX;
  return rho;
}
