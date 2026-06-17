// =============================================================================
// dcFitConfed.ts (pure)
// =============================================================================
// Phase 9B.2 — weighted-MLE fit for the confed-aware DC variant. Same
// algorithm as 9B's dcFitNational (analytic gradients + backtracking + ridge
// + warm start), with the addition of:
//
//   • conf[] gradient — each intercontinental match contributes
//       ∂J/∂conf[cᵢ] = +w·dLL/dλᴴ·λᴴ − w·dLL/dλᴬ·λᴬ
//       ∂J/∂conf[cⱼ] = −w·dLL/dλᴴ·λᴴ + w·dLL/dλᴬ·λᴬ
//     For intra-confederation matches (cᵢ = cⱼ) both partials are 0 —
//     conf[] is only informed by intercontinental matches.
//   • A small dedicated ridge on conf[] (lambdaRegConf, default 0.05) so the
//     intercontinental signal is not crushed by the same ridge that
//     regularises 223 team parameters.
//   • Recenter conf[] to mean 0 alongside the att/def recenter, so the
//     fitted levels are identified.
//
// τ correction, μ, h, ρ gradients are unchanged from the 9B variant.
// =============================================================================

import {
  CONFEDERATIONS,
  clampRho,
  cloneConfedParams,
  computeRatesConfed,
  makeInitialConfedParams,
  recenterConfed,
  RHO_MAX,
  RHO_MIN,
  tauDC,
  type Confederation,
  type DcConfedParams,
} from './dixonColesConfed';

export type FitMatchConfed = {
  homeIdx: number;
  awayIdx: number;
  homeConfIdx: number;
  awayConfIdx: number;
  homeGoals: number;
  awayGoals: number;
  daysBeforeFit: number;
  isNeutral: boolean;
};

export type FitConfigConfed = {
  xi: number;
  lambdaReg: number;
  /** Ridge applied to conf[]. Default 0.05 — much weaker than the att/def
   *  ridge so the intercontinental signal isn't squashed. Pass 0 to disable. */
  lambdaRegConf?: number;
  maxIterations?: number;
  gainTol?: number;
  initialStep?: number;
  initial?: DcConfedParams;
};

export type FitResultConfed = {
  params: DcConfedParams;
  iterations: number;
  finalObjective: number;
  objectives: number[];
  converged: boolean;
};

const DEFAULT_MAX_ITER = 500;
const DEFAULT_GAIN_TOL = 1e-7;
const DEFAULT_INIT_STEP = 0.5;
const DEFAULT_LAMBDA_REG_CONF = 0.05;
const STEP_DECAY = 0.5;
const MIN_STEP = 1e-12;

export function objectiveConfed(
  params: DcConfedParams,
  matches: ReadonlyArray<FitMatchConfed>,
  xi: number,
  lambdaReg: number,
  lambdaRegConf: number,
): number {
  let sum = 0;
  for (const m of matches) {
    const w = Math.exp(-xi * m.daysBeforeFit);
    const { lambdaH, lambdaA } = computeRatesConfed(
      params,
      m.homeIdx,
      m.awayIdx,
      m.homeConfIdx,
      m.awayConfIdx,
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
  let ridgeTeams = 0;
  for (let i = 0; i < params.att.length; i += 1) {
    ridgeTeams += params.att[i] * params.att[i] + params.def[i] * params.def[i];
  }
  let ridgeConf = 0;
  for (let k = 0; k < params.conf.length; k += 1) ridgeConf += params.conf[k] * params.conf[k];
  return sum - lambdaReg * ridgeTeams - lambdaRegConf * ridgeConf;
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

export type GradientConfed = {
  dMu: number;
  dHomeAdv: number;
  dRho: number;
  dAtt: number[];
  dDef: number[];
  dConf: number[];
};

function emptyGradient(nTeams: number, nConfeds: number): GradientConfed {
  return {
    dMu: 0,
    dHomeAdv: 0,
    dRho: 0,
    dAtt: new Array(nTeams).fill(0),
    dDef: new Array(nTeams).fill(0),
    dConf: new Array(nConfeds).fill(0),
  };
}

export function gradientConfed(
  params: DcConfedParams,
  matches: ReadonlyArray<FitMatchConfed>,
  xi: number,
  lambdaReg: number,
  lambdaRegConf: number,
): GradientConfed {
  const n = params.att.length;
  const k = params.conf.length;
  const g = emptyGradient(n, k);

  for (const m of matches) {
    const w = Math.exp(-xi * m.daysBeforeFit);
    const { lambdaH, lambdaA } = computeRatesConfed(
      params,
      m.homeIdx,
      m.awayIdx,
      m.homeConfIdx,
      m.awayConfIdx,
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
    if (!m.isNeutral) g.dHomeAdv += wH;
    g.dAtt[m.homeIdx] += wH;
    g.dDef[m.awayIdx] -= wH;
    g.dAtt[m.awayIdx] += wA;
    g.dDef[m.homeIdx] -= wA;

    // conf gradient — net contribution is zero when c_i == c_j.
    //   ∂λᴴ/∂conf[c_i] = +λᴴ  ;  ∂λᴴ/∂conf[c_j] = −λᴴ
    //   ∂λᴬ/∂conf[c_i] = −λᴬ  ;  ∂λᴬ/∂conf[c_j] = +λᴬ
    g.dConf[m.homeConfIdx] += wH - wA;
    g.dConf[m.awayConfIdx] -= wH - wA;

    g.dRho += w * tg.dLogTau_dRho;
  }

  for (let i = 0; i < n; i += 1) {
    g.dAtt[i] -= 2 * lambdaReg * params.att[i];
    g.dDef[i] -= 2 * lambdaReg * params.def[i];
  }
  for (let kc = 0; kc < k; kc += 1) {
    g.dConf[kc] -= 2 * lambdaRegConf * params.conf[kc];
  }
  return g;
}

function applyStep(params: DcConfedParams, g: GradientConfed, step: number): void {
  params.mu += step * g.dMu;
  params.homeAdv += step * g.dHomeAdv;
  params.rho = clampRho(params.rho + step * g.dRho);
  for (let i = 0; i < params.att.length; i += 1) {
    params.att[i] += step * g.dAtt[i];
    params.def[i] += step * g.dDef[i];
  }
  for (let kc = 0; kc < params.conf.length; kc += 1) {
    params.conf[kc] += step * g.dConf[kc];
  }
  recenterConfed(params);
}

export function fitDixonColesConfed(
  matches: ReadonlyArray<FitMatchConfed>,
  nTeams: number,
  config: FitConfigConfed,
): FitResultConfed {
  const maxIterations = config.maxIterations ?? DEFAULT_MAX_ITER;
  const gainTol = config.gainTol ?? DEFAULT_GAIN_TOL;
  const initStep = config.initialStep ?? DEFAULT_INIT_STEP;
  const lambdaRegConf = config.lambdaRegConf ?? DEFAULT_LAMBDA_REG_CONF;
  const params = config.initial ? cloneConfedParams(config.initial) : makeInitialConfedParams(nTeams);
  recenterConfed(params);
  params.rho = clampRho(params.rho);

  const objectives: number[] = [];
  let prev = objectiveConfed(params, matches, config.xi, config.lambdaReg, lambdaRegConf);
  objectives.push(prev);

  let converged = false;
  let iter = 0;
  for (; iter < maxIterations; iter += 1) {
    const g = gradientConfed(params, matches, config.xi, config.lambdaReg, lambdaRegConf);
    let step = initStep;
    let candidate = cloneConfedParams(params);
    applyStep(candidate, g, step);
    let candObj = objectiveConfed(candidate, matches, config.xi, config.lambdaReg, lambdaRegConf);
    while (step > MIN_STEP && (!Number.isFinite(candObj) || candObj < prev)) {
      step *= STEP_DECAY;
      candidate = cloneConfedParams(params);
      applyStep(candidate, g, step);
      candObj = objectiveConfed(candidate, matches, config.xi, config.lambdaReg, lambdaRegConf);
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
    for (let kc = 0; kc < params.conf.length; kc += 1) {
      params.conf[kc] = candidate.conf[kc];
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

export { CONFEDERATIONS, RHO_MIN, RHO_MAX };
export type { Confederation };
