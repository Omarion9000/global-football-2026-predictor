// =============================================================================
// dcFit.ts (pure)
// =============================================================================
// Phase 8B — weighted ridge-regularised MLE for Dixon-Coles parameters with
// analytic gradients and a backtracking line search.
//
// Objective J(θ) =  Σ_m  wₘ · log Pᴰᶜ(scoreH_m, scoreA_m | θ)
//                 − λ_reg · ( Σ_i αᵢ² + Σ_i δᵢ² )
//
// where wₘ = exp(−ξ · Δdaysₘ) is the exponential time decay, and
//       log Pᴰᶜ ≈ log τ + x · log λᴴ − λᴴ + y · log λᴬ − λᴬ + const
// (the standard DC 1997 unnormalised log-likelihood — the multinomial
// constant doesn't depend on θ and is dropped).
//
// Gradients
//   ∂λᴴ/∂μ      = λᴴ                  ∂λᴴ/∂h         = λᴴ
//   ∂λᴴ/∂α[i]   = λᴴ  (home team i)   ∂λᴴ/∂δ[j]      = −λᴴ (away team j)
//   ∂λᴬ/∂μ      = λᴬ                  ∂λᴬ/∂h         = 0
//   ∂λᴬ/∂α[j]   = λᴬ                  ∂λᴬ/∂δ[i]      = −λᴬ
//   ∂(x·logλᴴ − λᴴ)/∂λᴴ = x/λᴴ − 1
//   ∂(y·logλᴬ − λᴬ)/∂λᴬ = y/λᴬ − 1
//
// τ-derivative contributions are computed cell-by-cell for the four DC cells.
//
// Convergence: gain < gainTol (default 1e-7) OR maxIterations (default 500).
// Backtracking: halve the step until the objective does not decrease.
// =============================================================================

import {
  RHO_MAX,
  RHO_MIN,
  clampRho,
  cloneParams,
  computeRates,
  makeInitialParams,
  recenter,
  tauDC,
  type DcParams,
} from './dixonColes';

export type FitMatch = {
  homeIdx: number;
  awayIdx: number;
  homeGoals: number;
  awayGoals: number;
  /** Days between the match date and the fit date (≥ 0; older matches → larger). */
  daysBeforeFit: number;
};

export type FitConfig = {
  /** Time-decay rate per day. wₘ = exp(−ξ · daysBeforeFit). */
  xi: number;
  /** Ridge penalty on α and δ. */
  lambdaReg: number;
  /** Maximum iterations. Default: 500 (cold start) — pass a smaller value
   *  for warm starts. */
  maxIterations?: number;
  /** Objective gain below this halts the optimiser. Default: 1e-7. */
  gainTol?: number;
  /** Initial step size. Default: 0.5. */
  initialStep?: number;
  /** Warm-start parameters. Cloned defensively before iteration. */
  initial?: DcParams;
};

export type FitResult = {
  params: DcParams;
  iterations: number;
  finalObjective: number;
  /** Objective after each accepted iteration. Used by the runner's GATE D
   *  (objective must be non-decreasing across iterations). */
  objectives: number[];
  /** True if the run stopped on the gain criterion (else it hit maxIterations). */
  converged: boolean;
};

const DEFAULT_MAX_ITER = 500;
const DEFAULT_GAIN_TOL = 1e-7;
const DEFAULT_INIT_STEP = 0.5;
const STEP_DECAY = 0.5;
const MIN_STEP = 1e-12;

/**
 * Compute the regularised objective J(θ) for a buffer of matches with their
 * pre-computed decay weights.
 */
export function objective(
  params: DcParams,
  matches: ReadonlyArray<FitMatch>,
  xi: number,
  lambdaReg: number,
): number {
  let sum = 0;
  for (const m of matches) {
    const w = Math.exp(-xi * m.daysBeforeFit);
    const { lambdaH, lambdaA } = computeRates(params, m.homeIdx, m.awayIdx);
    const tau = tauDC(m.homeGoals, m.awayGoals, lambdaH, lambdaA, params.rho);
    if (!Number.isFinite(tau) || tau <= 0) continue; // skip infeasible draw (ρ wandered)
    const ll =
      Math.log(tau) +
      m.homeGoals * Math.log(lambdaH) -
      lambdaH +
      m.awayGoals * Math.log(lambdaA) -
      lambdaA;
    sum += w * ll;
  }
  let ridge = 0;
  for (let i = 0; i < params.att.length; i += 1) {
    ridge += params.att[i] * params.att[i] + params.def[i] * params.def[i];
  }
  return sum - lambdaReg * ridge;
}

/** ∂(log τ)/∂λᴴ, ∂(log τ)/∂λᴬ, ∂(log τ)/∂ρ for the four DC cells. */
function tauLogGrads(
  x: number,
  y: number,
  lambdaH: number,
  lambdaA: number,
  rho: number,
): { dLogTau_dLambdaH: number; dLogTau_dLambdaA: number; dLogTau_dRho: number } {
  if (x === 0 && y === 0) {
    const t = 1 - lambdaH * lambdaA * rho;
    return {
      dLogTau_dLambdaH: (-lambdaA * rho) / t,
      dLogTau_dLambdaA: (-lambdaH * rho) / t,
      dLogTau_dRho: (-lambdaH * lambdaA) / t,
    };
  }
  if (x === 1 && y === 0) {
    const t = 1 + lambdaA * rho;
    return { dLogTau_dLambdaH: 0, dLogTau_dLambdaA: rho / t, dLogTau_dRho: lambdaA / t };
  }
  if (x === 0 && y === 1) {
    const t = 1 + lambdaH * rho;
    return { dLogTau_dLambdaH: rho / t, dLogTau_dLambdaA: 0, dLogTau_dRho: lambdaH / t };
  }
  if (x === 1 && y === 1) {
    const t = 1 - rho;
    return { dLogTau_dLambdaH: 0, dLogTau_dLambdaA: 0, dLogTau_dRho: -1 / t };
  }
  return { dLogTau_dLambdaH: 0, dLogTau_dLambdaA: 0, dLogTau_dRho: 0 };
}

export type Gradient = {
  dMu: number;
  dHomeAdv: number;
  dRho: number;
  dAtt: number[];
  dDef: number[];
};

export function emptyGradient(nTeams: number): Gradient {
  return {
    dMu: 0,
    dHomeAdv: 0,
    dRho: 0,
    dAtt: new Array(nTeams).fill(0),
    dDef: new Array(nTeams).fill(0),
  };
}

/**
 * Compute the analytic gradient of J(θ) at `params`. The result is a NEW
 * Gradient object; the caller can apply it with a step size of its choice.
 */
export function gradient(
  params: DcParams,
  matches: ReadonlyArray<FitMatch>,
  xi: number,
  lambdaReg: number,
): Gradient {
  const n = params.att.length;
  const g = emptyGradient(n);

  for (const m of matches) {
    const w = Math.exp(-xi * m.daysBeforeFit);
    const { lambdaH, lambdaA } = computeRates(params, m.homeIdx, m.awayIdx);

    // Score-term derivative wrt λ.
    const dScore_dLambdaH = m.homeGoals / lambdaH - 1;
    const dScore_dLambdaA = m.awayGoals / lambdaA - 1;

    // τ-term derivatives wrt λ and ρ.
    const tg = tauLogGrads(m.homeGoals, m.awayGoals, lambdaH, lambdaA, params.rho);

    // Combined log-likelihood derivative wrt λᴴ and λᴬ.
    const dLL_dLambdaH = dScore_dLambdaH + tg.dLogTau_dLambdaH;
    const dLL_dLambdaA = dScore_dLambdaA + tg.dLogTau_dLambdaA;

    // Chain rule into μ, h, αᵢ, αⱼ, δᵢ, δⱼ via the partial derivatives:
    //   ∂λᴴ/∂μ = λᴴ, ∂λᴴ/∂h = λᴴ, ∂λᴴ/∂α[home] = λᴴ, ∂λᴴ/∂δ[away] = −λᴴ
    //   ∂λᴬ/∂μ = λᴬ, ∂λᴬ/∂h = 0,   ∂λᴬ/∂α[away] = λᴬ, ∂λᴬ/∂δ[home] = −λᴬ
    const wH = w * dLL_dLambdaH * lambdaH;
    const wA = w * dLL_dLambdaA * lambdaA;

    g.dMu += wH + wA;
    g.dHomeAdv += wH;
    g.dAtt[m.homeIdx] += wH;
    g.dDef[m.awayIdx] -= wH;
    g.dAtt[m.awayIdx] += wA;
    g.dDef[m.homeIdx] -= wA;

    // ρ derivative (purely from τ).
    g.dRho += w * tg.dLogTau_dRho;
  }

  // Ridge penalty contribution: ∂(−λ_reg Σ α²)/∂α = −2 λ_reg α (same for δ).
  for (let i = 0; i < n; i += 1) {
    g.dAtt[i] -= 2 * lambdaReg * params.att[i];
    g.dDef[i] -= 2 * lambdaReg * params.def[i];
  }

  return g;
}

/** Apply `params <- params + step * g`, then re-center and clamp ρ. */
function applyStep(params: DcParams, g: Gradient, step: number): void {
  params.mu += step * g.dMu;
  params.homeAdv += step * g.dHomeAdv;
  params.rho = clampRho(params.rho + step * g.dRho);
  for (let i = 0; i < params.att.length; i += 1) {
    params.att[i] += step * g.dAtt[i];
    params.def[i] += step * g.dDef[i];
  }
  recenter(params);
}

/**
 * Fit Dixon-Coles parameters by weighted MLE with analytic gradients and a
 * backtracking step. Pure — does not mutate `config.initial`.
 */
export function fitDixonColes(
  matches: ReadonlyArray<FitMatch>,
  nTeams: number,
  config: FitConfig,
): FitResult {
  const maxIterations = config.maxIterations ?? DEFAULT_MAX_ITER;
  const gainTol = config.gainTol ?? DEFAULT_GAIN_TOL;
  const initStep = config.initialStep ?? DEFAULT_INIT_STEP;
  const params = config.initial ? cloneParams(config.initial) : makeInitialParams(nTeams);
  // Defensive: also recenter the warm-start in case it drifted.
  recenter(params);
  params.rho = clampRho(params.rho);

  const objectives: number[] = [];
  let prev = objective(params, matches, config.xi, config.lambdaReg);
  objectives.push(prev);

  let converged = false;
  let iter = 0;
  for (; iter < maxIterations; iter += 1) {
    const g = gradient(params, matches, config.xi, config.lambdaReg);

    // Backtracking line search: try `step`, halve until objective rises
    // (or we run out of step).
    let step = initStep;
    let candidate = cloneParams(params);
    applyStep(candidate, g, step);
    let candObj = objective(candidate, matches, config.xi, config.lambdaReg);

    while (
      step > MIN_STEP &&
      (!Number.isFinite(candObj) || candObj < prev)
    ) {
      step *= STEP_DECAY;
      candidate = cloneParams(params);
      applyStep(candidate, g, step);
      candObj = objective(candidate, matches, config.xi, config.lambdaReg);
    }

    if (candObj <= prev) {
      // Could not improve — declare convergence.
      converged = true;
      break;
    }

    // Accept.
    params.mu = candidate.mu;
    params.homeAdv = candidate.homeAdv;
    params.rho = candidate.rho;
    for (let i = 0; i < params.att.length; i += 1) {
      params.att[i] = candidate.att[i];
      params.def[i] = candidate.def[i];
    }
    objectives.push(candObj);

    if (candObj - prev < gainTol) {
      converged = true;
      prev = candObj;
      iter += 1;
      break;
    }
    prev = candObj;
  }

  // Final ρ clamp (it has been clamped inside applyStep already, but defensive
  // in case the warm start was outside bounds and we accepted no updates).
  params.rho = clampRho(params.rho);
  return {
    params,
    iterations: iter,
    finalObjective: prev,
    objectives,
    converged,
  };
}

export { RHO_MIN, RHO_MAX };
