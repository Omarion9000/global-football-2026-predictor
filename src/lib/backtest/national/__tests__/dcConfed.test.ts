import { describe, expect, it } from 'vitest';
import {
  CONFEDERATIONS,
  computeRatesConfed,
  confederationIndex,
  makeInitialConfedParams,
  predictTripleConfed,
  recenterConfed,
  scoreMatrixConfed,
} from '../dixonColesConfed';
import {
  fitDixonColesConfed,
  gradientConfed,
  objectiveConfed,
  type FitMatchConfed,
} from '../dcFitConfed';

// =============================================================================
// Rate equation includes (conf[c_i] - conf[c_j]) and zeroes out for c_i = c_j.
// =============================================================================

describe('computeRatesConfed', () => {
  it('intra-confederation match: conf term cancels — same rates as confederation-blind formulation', () => {
    const p = makeInitialConfedParams(2);
    p.mu = 0.1; p.homeAdv = 0.25;
    p.att[0] = 0.2; p.att[1] = -0.2;
    p.def[0] = -0.1; p.def[1] = 0.1;
    p.conf = [0.3, -0.1, 0.05, -0.25, 0.0, 0.0]; recenterConfed(p);
    const sameConf = computeRatesConfed(p, 0, 1, 0, 0, false); // both AFC
    // Manual confed-blind rate (μ + h + α[0] − δ[1]).
    const expectedH = Math.exp(p.mu + p.homeAdv + p.att[0] - p.def[1]);
    const expectedA = Math.exp(p.mu + p.att[1] - p.def[0]);
    expect(sameConf.lambdaH).toBeCloseTo(expectedH, 12);
    expect(sameConf.lambdaA).toBeCloseTo(expectedA, 12);
  });

  it('inter-confederation match: conf differential moves both lambdas', () => {
    const p = makeInitialConfedParams(2);
    p.mu = 0.1; p.homeAdv = 0.25;
    p.conf = [0.3, -0.3, 0.0, 0.0, 0.0, 0.0]; // AFC strong, CAF weak
    const homeConf = 0, awayConf = 1; // AFC home vs CAF away
    const rates = computeRatesConfed(p, 0, 1, homeConf, awayConf, false);
    // λᴴ should be MULTIPLIED by exp(conf[home] - conf[away]) = exp(0.6).
    const baseline = Math.exp(p.mu + p.homeAdv + p.att[0] - p.def[1]);
    expect(rates.lambdaH).toBeCloseTo(baseline * Math.exp(0.3 - (-0.3)), 12);
  });
});

// =============================================================================
// Recenter
// =============================================================================

describe('recenterConfed', () => {
  it('zeroes mean(att), mean(def), AND mean(conf)', () => {
    const p = makeInitialConfedParams(4);
    p.att = [0.3, 0.1, -0.2, -0.1];
    p.def = [-0.4, 0.0, 0.1, 0.2];
    p.conf = [0.6, 0.3, 0.0, -0.3, -0.6, 0.5];
    recenterConfed(p);
    const meanA = p.att.reduce((a, b) => a + b, 0) / p.att.length;
    const meanD = p.def.reduce((a, b) => a + b, 0) / p.def.length;
    const meanC = p.conf.reduce((a, b) => a + b, 0) / p.conf.length;
    expect(Math.abs(meanA)).toBeLessThan(1e-12);
    expect(Math.abs(meanD)).toBeLessThan(1e-12);
    expect(Math.abs(meanC)).toBeLessThan(1e-12);
  });
});

// =============================================================================
// Score matrix sums to 1
// =============================================================================

describe('scoreMatrixConfed + predictTripleConfed', () => {
  it('produces a probability triple summing to 1 (inter-confed neutral match)', () => {
    const p = makeInitialConfedParams(2);
    p.mu = 0.1; p.rho = -0.05;
    p.att = [0.2, -0.2]; p.def = [-0.1, 0.1];
    p.conf = [0.3, -0.3, 0.0, 0.0, 0.0, 0.0]; recenterConfed(p);
    const [pH, pD, pA] = predictTripleConfed(p, 0, 1, 0, 1, true);
    expect(pH + pD + pA).toBeCloseTo(1, 10);
  });
});

// =============================================================================
// Gradient: analytic vs finite-difference for conf[] (the new partials).
// =============================================================================

function tinyConfedCorpus(): { matches: FitMatchConfed[]; nTeams: number } {
  // 6 teams across 3 confederations (2 per confederation).
  // Mix of intra- and inter-confederation matches.
  return {
    nTeams: 6,
    matches: [
      { homeIdx: 0, awayIdx: 1, homeConfIdx: 0, awayConfIdx: 0, homeGoals: 2, awayGoals: 1, daysBeforeFit: 30, isNeutral: false }, // AFC v AFC
      { homeIdx: 2, awayIdx: 3, homeConfIdx: 1, awayConfIdx: 1, homeGoals: 1, awayGoals: 1, daysBeforeFit: 28, isNeutral: false }, // CAF v CAF
      { homeIdx: 4, awayIdx: 5, homeConfIdx: 2, awayConfIdx: 2, homeGoals: 0, awayGoals: 2, daysBeforeFit: 25, isNeutral: false }, // CCF v CCF
      { homeIdx: 0, awayIdx: 2, homeConfIdx: 0, awayConfIdx: 1, homeGoals: 3, awayGoals: 0, daysBeforeFit: 20, isNeutral: true  }, // AFC v CAF (inter)
      { homeIdx: 2, awayIdx: 4, homeConfIdx: 1, awayConfIdx: 2, homeGoals: 1, awayGoals: 2, daysBeforeFit: 15, isNeutral: true  }, // CAF v CCF
      { homeIdx: 4, awayIdx: 0, homeConfIdx: 2, awayConfIdx: 0, homeGoals: 1, awayGoals: 1, daysBeforeFit: 10, isNeutral: true  }, // CCF v AFC
      { homeIdx: 1, awayIdx: 3, homeConfIdx: 0, awayConfIdx: 1, homeGoals: 0, awayGoals: 2, daysBeforeFit: 5,  isNeutral: true  }, // AFC v CAF
      { homeIdx: 5, awayIdx: 1, homeConfIdx: 2, awayConfIdx: 0, homeGoals: 1, awayGoals: 1, daysBeforeFit: 0,  isNeutral: true  }, // CCF v AFC
    ],
  };
}

describe('gradientConfed — analytic dConf matches finite differences', () => {
  it('checks each confederation strength gradient against central FD (tol 1e-4)', () => {
    const { matches, nTeams } = tinyConfedCorpus();
    const p = makeInitialConfedParams(nTeams);
    p.mu = 0.1; p.homeAdv = 0.25; p.rho = -0.05;
    p.att = [0.3, -0.1, 0.05, -0.25, 0.2, -0.2]; recenterConfed(p);
    p.def = [-0.2, 0.1, 0.2, -0.1, 0.0, 0.0]; // mean 0
    p.conf = [0.3, -0.1, 0.0, 0.0, 0.0, 0.0]; // partial intercontinental signal
    recenterConfed(p);

    const xi = 0.002, lambdaReg = 1, lambdaRegConf = 0.05;
    const analytic = gradientConfed(p, matches, xi, lambdaReg, lambdaRegConf);

    function dConfBy(k: number, h = 1e-5): number {
      const plus = { ...p, att: p.att.slice(), def: p.def.slice(), conf: p.conf.slice() };
      const minus = { ...p, att: p.att.slice(), def: p.def.slice(), conf: p.conf.slice() };
      plus.conf[k] += h;
      minus.conf[k] -= h;
      return (
        (objectiveConfed(plus, matches, xi, lambdaReg, lambdaRegConf) -
          objectiveConfed(minus, matches, xi, lambdaReg, lambdaRegConf)) /
        (2 * h)
      );
    }

    for (let k = 0; k < CONFEDERATIONS.length; k += 1) {
      const fd = dConfBy(k);
      expect(Math.abs(analytic.dConf[k] - fd)).toBeLessThan(1e-4);
    }
  });
});

// =============================================================================
// Identifiability: intra-confederation matches alone leave conf[] near 0.
// =============================================================================

describe('fitDixonColesConfed — intercontinental-only-informs-conf', () => {
  it('all intra-confederation matches → fitted conf[] stays ~0 (cannot identify)', () => {
    const matches: FitMatchConfed[] = [];
    // 100 matches, all within AFC (confIdx 0). conf[0] vs others is
    // unidentified.
    for (let i = 0; i < 100; i += 1) {
      matches.push({
        homeIdx: i % 2,
        awayIdx: (i + 1) % 2,
        homeConfIdx: 0,
        awayConfIdx: 0,
        homeGoals: 1 + (i % 3),
        awayGoals: i % 2,
        daysBeforeFit: 50 - i / 2,
        isNeutral: i % 2 === 0,
      });
    }
    const { params } = fitDixonColesConfed(matches, 2, {
      xi: 0,
      lambdaReg: 1,
      lambdaRegConf: 0.05,
    });
    // After fit + recenter, conf[] is mean 0; intracontinental-only
    // data leaves it AT 0 because the gradient contribution is 0 and the
    // ridge pulls toward 0.
    for (let k = 0; k < params.conf.length; k += 1) {
      expect(Math.abs(params.conf[k])).toBeLessThan(1e-6);
    }
  });

  it('synthetic confederation gap is recovered in the right direction', () => {
    // Simulate matches between two confederations where AFC scores +1 goal
    // more on average than the other. The fitted conf[AFC] should end up
    // higher than conf[CAF].
    const matches: FitMatchConfed[] = [];
    // 60 inter-confederation matches: AFC team (idx 0) vs CAF team (idx 1).
    // AFC scores ~2 on average, CAF scores ~1.
    let dayCounter = 50;
    for (let i = 0; i < 30; i += 1) {
      matches.push({
        homeIdx: 0, awayIdx: 1,
        homeConfIdx: 0, awayConfIdx: 1,
        homeGoals: 2, awayGoals: 1,
        daysBeforeFit: dayCounter--, isNeutral: true,
      });
      matches.push({
        homeIdx: 1, awayIdx: 0,
        homeConfIdx: 1, awayConfIdx: 0,
        homeGoals: 1, awayGoals: 2,
        daysBeforeFit: dayCounter--, isNeutral: true,
      });
    }
    // Add 30 intra-AFC matches and 30 intra-CAF matches to fix att/def
    // levels within each confederation.
    for (let i = 0; i < 30; i += 1) {
      matches.push({
        homeIdx: 0, awayIdx: 0,
        homeConfIdx: 0, awayConfIdx: 0,
        homeGoals: 1, awayGoals: 1,
        daysBeforeFit: dayCounter--, isNeutral: true,
      });
      matches.push({
        homeIdx: 1, awayIdx: 1,
        homeConfIdx: 1, awayConfIdx: 1,
        homeGoals: 1, awayGoals: 1,
        daysBeforeFit: dayCounter--, isNeutral: true,
      });
    }
    const { params } = fitDixonColesConfed(matches, 2, {
      xi: 0, lambdaReg: 1, lambdaRegConf: 0.01, maxIterations: 1000,
    });
    // AFC (index 0) should end up > CAF (index 1).
    expect(params.conf[0]).toBeGreaterThan(params.conf[1]);
  });
});

// =============================================================================
// Recenter + monotone objective + sanity invariants
// =============================================================================

describe('fitDixonColesConfed — invariants', () => {
  it('non-decreasing objective trajectory + mean-zero att/def/conf at the end', () => {
    const { matches, nTeams } = tinyConfedCorpus();
    const result = fitDixonColesConfed(matches, nTeams, { xi: 0.002, lambdaReg: 1 });
    for (let i = 1; i < result.objectives.length; i += 1) {
      expect(result.objectives[i]).toBeGreaterThanOrEqual(result.objectives[i - 1] - 1e-12);
    }
    const meanA = result.params.att.reduce((a, b) => a + b, 0) / result.params.att.length;
    const meanD = result.params.def.reduce((a, b) => a + b, 0) / result.params.def.length;
    const meanC = result.params.conf.reduce((a, b) => a + b, 0) / result.params.conf.length;
    expect(Math.abs(meanA)).toBeLessThan(1e-8);
    expect(Math.abs(meanD)).toBeLessThan(1e-8);
    expect(Math.abs(meanC)).toBeLessThan(1e-8);
  });
});

// =============================================================================
// CONFEDERATIONS export sanity (used by the runner)
// =============================================================================

describe('CONFEDERATIONS + confederationIndex', () => {
  it('contains exactly the six FIFA confederations in a stable order', () => {
    expect(CONFEDERATIONS).toEqual(['AFC', 'CAF', 'CONCACAF', 'CONMEBOL', 'OFC', 'UEFA']);
    expect(confederationIndex('AFC')).toBe(0);
    expect(confederationIndex('UEFA')).toBe(5);
  });
});

// =============================================================================
// scoreMatrix output integrity
// =============================================================================

describe('scoreMatrixConfed — grid integrity', () => {
  it('every cell is non-negative and grid sums to 1', () => {
    const p = makeInitialConfedParams(2);
    p.mu = 0.1; p.homeAdv = 0.25; p.rho = -0.1;
    p.att = [0.4, -0.4]; p.def = [-0.2, 0.2];
    p.conf = [0.5, 0, 0, 0, 0, -0.5]; recenterConfed(p);
    const grid = scoreMatrixConfed(p, 0, 1, 0, 5, false);
    let total = 0;
    for (const row of grid) {
      for (const v of row) {
        expect(v).toBeGreaterThanOrEqual(0);
        total += v;
      }
    }
    expect(total).toBeCloseTo(1, 10);
  });
});
