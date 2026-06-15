// =============================================================================
// dcFitNational.ts (pure)
// =============================================================================
// Phase 9B — weighted ridge MLE for the national Dixon-Coles variant. Same
// algorithm as Phase 8B's dcFit (analytic gradients + backtracking line
// search + ridge), differing only in:
//
//   (1) The rate equation uses the neutral-gated home advantage from
//       dixonColesNational.computeRatesNational.
//   (2) Each match's contribution to ∂J/∂homeAdv is zero when neutral=true.
//
// Everything else (μ, α, δ, ρ gradients; ridge penalty; recenter; ρ clamp)
// is unchanged.
// =============================================================================

import {
  clampRho,
  cloneParams,
  computeRatesNational,
  makeInitialParams,
  recenter,
  RHO_MAX,
  RHO_MIN,
  tauDC,
  type DcParams,
} from './dixonColesNational';

export type FitMatchNational = {
  homeIdx: number;
  awayIdx: number;
  homeGoals: number;
  awayGoals: number;
  /** Days between the match date and the fit date (≥ 0). */
  daysBeforeFit: number;
  /** Neutral-venue flag. */
  isNeutral: boolean;
};

export type FitConfigNational = {
  xi: number;
  lambdaReg: number;
  maxIterations?: number;
  gainTol?: number;
  initialStep?: number;
  initial?: DcParams;
};

export type FitResultNational = {
  params: DcParams;
  iterations: number;
  finalObjective: number;
  objectives: number[];
  converged: boolean;
};

const DEFAULT_MAX_ITER = 500;
const DEFAULT_GAIN_TOL = 1e-7;
const DEFAULT_INIT_STEP = 0.5;
const STEP_DECAY = 0.5;
const MIN_STEP = 1e-12;

export function objectiveNational(
  params: DcParams,
  matches: ReadonlyArray<FitMatchNational>,
  xi: number,
  lambdaReg: number,
): number {
  let sum = 0;
  for (const m of matches) {
    const w = Math.exp(-xi * m.daysBeforeFit);
    const { lambdaH, lambdaA } = computeRatesNational(
      params,
      m.homeIdx,
      m.awayIdx,
      m.isNeutral,
    );
    const tau = tauDC(m.homeGoals, m.awayGoals, lambdaH, lambdaA, params.rho);
    if (!Number.isFinite(tau) || tau <= 0) continue;
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

export type GradientNational = {
  dMu: number;
  dHomeAdv: number;
  dRho: number;
  dAtt: number[];
  dDef: number[];
};

function emptyGradient(nTeams: number): GradientNational {
  return {
    dMu: 0,
    dHomeAdv: 0,
    dRho: 0,
    dAtt: new Array(nTeams).fill(0),
    dDef: new Array(nTeams).fill(0),
  };
}

export function gradientNational(
  params: DcParams,
  matches: ReadonlyArray<FitMatchNational>,
  xi: number,
  lambdaReg: number,
): GradientNational {
  const n = params.att.length;
  const g = emptyGradient(n);

  for (const m of matches) {
    const w = Math.exp(-xi * m.daysBeforeFit);
    const { lambdaH, lambdaA } = computeRatesNational(
      params,
      m.homeIdx,
      m.awayIdx,
      m.isNeutral,
    );

    const dScore_dLambdaH = m.homeGoals / lambdaH - 1;
    const dScore_dLambdaA = m.awayGoals / lambdaA - 1;
    const tg = tauLogGrads(m.homeGoals, m.awayGoals, lambdaH, lambdaA, params.rho);

    const dLL_dLambdaH = dScore_dLambdaH + tg.dLogTau_dLambdaH;
    const dLL_dLambdaA = dScore_dLambdaA + tg.dLogTau_dLambdaA;

    const wH = w * dLL_dLambdaH * lambdaH;
    const wA = w * dLL_dLambdaA * lambdaA;

    g.dMu += wH + wA;
    // ─── Neutral gating ───────────────────────────────────────────────────
    // ∂λᴴ/∂homeAdv = λᴴ when !isNeutral, else 0. Skip the homeAdv contribution
    // for neutral-venue matches entirely.
    if (!m.isNeutral) g.dHomeAdv += wH;
    // ──────────────────────────────────────────────────────────────────────
    g.dAtt[m.homeIdx] += wH;
    g.dDef[m.awayIdx] -= wH;
    g.dAtt[m.awayIdx] += wA;
    g.dDef[m.homeIdx] -= wA;

    g.dRho += w * tg.dLogTau_dRho;
  }

  for (let i = 0; i < n; i += 1) {
    g.dAtt[i] -= 2 * lambdaReg * params.att[i];
    g.dDef[i] -= 2 * lambdaReg * params.def[i];
  }
  return g;
}

function applyStep(params: DcParams, g: GradientNational, step: number): void {
  params.mu += step * g.dMu;
  params.homeAdv += step * g.dHomeAdv;
  params.rho = clampRho(params.rho + step * g.dRho);
  for (let i = 0; i < params.att.length; i += 1) {
    params.att[i] += step * g.dAtt[i];
    params.def[i] += step * g.dDef[i];
  }
  recenter(params);
}

export function fitDixonColesNational(
  matches: ReadonlyArray<FitMatchNational>,
  nTeams: number,
  config: FitConfigNational,
): FitResultNational {
  const maxIterations = config.maxIterations ?? DEFAULT_MAX_ITER;
  const gainTol = config.gainTol ?? DEFAULT_GAIN_TOL;
  const initStep = config.initialStep ?? DEFAULT_INIT_STEP;
  const params = config.initial ? cloneParams(config.initial) : makeInitialParams(nTeams);
  recenter(params);
  params.rho = clampRho(params.rho);

  const objectives: number[] = [];
  let prev = objectiveNational(params, matches, config.xi, config.lambdaReg);
  objectives.push(prev);

  let converged = false;
  let iter = 0;
  for (; iter < maxIterations; iter += 1) {
    const g = gradientNational(params, matches, config.xi, config.lambdaReg);
    let step = initStep;
    let candidate = cloneParams(params);
    applyStep(candidate, g, step);
    let candObj = objectiveNational(candidate, matches, config.xi, config.lambdaReg);
    while (step > MIN_STEP && (!Number.isFinite(candObj) || candObj < prev)) {
      step *= STEP_DECAY;
      candidate = cloneParams(params);
      applyStep(candidate, g, step);
      candObj = objectiveNational(candidate, matches, config.xi, config.lambdaReg);
    }
    if (candObj <= prev) {
      converged = true;
      break;
    }
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
  params.rho = clampRho(params.rho);
  return { params, iterations: iter, finalObjective: prev, objectives, converged };
}

export { RHO_MIN, RHO_MAX };
