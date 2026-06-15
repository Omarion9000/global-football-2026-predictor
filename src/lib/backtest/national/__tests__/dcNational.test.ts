import { describe, expect, it } from 'vitest';
import {
  computeRatesNational,
  makeInitialParams,
  predictTripleNational,
  scoreMatrixNational,
  type DcParams,
} from '../dixonColesNational';
import {
  fitDixonColesNational,
  gradientNational,
  objectiveNational,
  type FitMatchNational,
} from '../dcFitNational';

// =============================================================================
// W6 — neutral gating: same fixture with neutral=false vs neutral=true
// must yield a higher λᴴ for the home-team-favoured case.
// =============================================================================

describe('computeRatesNational — neutral gating', () => {
  it('non-neutral match applies homeAdv to lambdaH; neutral match does not', () => {
    const p = makeInitialParams(2);
    p.mu = 0.1;
    p.homeAdv = 0.25;
    p.att[0] = 0.2; p.att[1] = -0.2; // sums to 0
    p.def[0] = -0.1; p.def[1] = 0.1; // sums to 0
    const nonNeutral = computeRatesNational(p, 0, 1, false);
    const neutral = computeRatesNational(p, 0, 1, true);
    // λᴴ should drop by exactly factor exp(0.25) when switching to neutral.
    expect(nonNeutral.lambdaH / neutral.lambdaH).toBeCloseTo(Math.exp(0.25), 12);
    // λᴬ should be the SAME (homeAdv never affects away rate).
    expect(nonNeutral.lambdaA).toBeCloseTo(neutral.lambdaA, 12);
  });

  it('homeAdv=0 means neutral and non-neutral yield identical rates', () => {
    const p = makeInitialParams(2);
    p.mu = 0.1;
    p.homeAdv = 0; // edge case
    p.att = [0.3, -0.3]; p.def = [-0.1, 0.1];
    const a = computeRatesNational(p, 0, 1, false);
    const b = computeRatesNational(p, 0, 1, true);
    expect(a.lambdaH).toBeCloseTo(b.lambdaH, 12);
    expect(a.lambdaA).toBeCloseTo(b.lambdaA, 12);
  });
});

// =============================================================================
// Score matrix sums to 1 + symmetry-at-zero-params produces near-symmetric
// triples for neutral matches (no home preference at all).
// =============================================================================

describe('scoreMatrixNational + predictTripleNational', () => {
  it('produces a probability triple summing to 1', () => {
    const p = makeInitialParams(4);
    p.mu = 0.1;
    p.homeAdv = 0.25;
    p.att = [0.2, -0.1, 0.05, -0.15]; p.def = [-0.1, 0.1, 0.05, -0.05];
    const [pH, pD, pA] = predictTripleNational(p, 0, 1, false);
    expect(pH + pD + pA).toBeCloseTo(1, 10);
    expect(pH).toBeGreaterThan(0);
    expect(pD).toBeGreaterThan(0);
    expect(pA).toBeGreaterThan(0);
  });

  it('zero-params + neutral=true → symmetric triple (pH == pA)', () => {
    const p = makeInitialParams(2);
    const [pH, , pA] = predictTripleNational(p, 0, 1, true);
    expect(pH).toBeCloseTo(pA, 12);
  });

  it('zero-params + neutral=false → asymmetric triple (pH > pA via homeAdv only)', () => {
    const p = makeInitialParams(2);
    p.homeAdv = 0.3; // pure home effect
    const [pH, , pA] = predictTripleNational(p, 0, 1, false);
    expect(pH).toBeGreaterThan(pA);
  });
});

// =============================================================================
// Fit — finite-difference gradient check including the homeAdv path.
// =============================================================================

function fdGradient(
  params: DcParams,
  matches: FitMatchNational[],
  xi: number,
  lambdaReg: number,
  h = 1e-5,
): { dHomeAdv: number } {
  const plus = { ...params, att: params.att.slice(), def: params.def.slice() };
  const minus = { ...params, att: params.att.slice(), def: params.def.slice() };
  plus.homeAdv += h;
  minus.homeAdv -= h;
  return {
    dHomeAdv:
      (objectiveNational(plus, matches, xi, lambdaReg) -
        objectiveNational(minus, matches, xi, lambdaReg)) /
      (2 * h),
  };
}

describe('gradientNational — analytic vs finite differences for homeAdv', () => {
  it('analytic dHomeAdv matches FD on a 4-team / 6-match dataset (mixed neutral)', () => {
    const matches: FitMatchNational[] = [
      { homeIdx: 0, awayIdx: 1, homeGoals: 2, awayGoals: 1, daysBeforeFit: 30, isNeutral: false },
      { homeIdx: 1, awayIdx: 2, homeGoals: 1, awayGoals: 1, daysBeforeFit: 20, isNeutral: true },
      { homeIdx: 2, awayIdx: 3, homeGoals: 0, awayGoals: 1, daysBeforeFit: 15, isNeutral: false },
      { homeIdx: 3, awayIdx: 0, homeGoals: 1, awayGoals: 2, daysBeforeFit: 10, isNeutral: true },
      { homeIdx: 0, awayIdx: 2, homeGoals: 1, awayGoals: 0, daysBeforeFit: 5,  isNeutral: false },
      { homeIdx: 1, awayIdx: 3, homeGoals: 0, awayGoals: 0, daysBeforeFit: 0,  isNeutral: true },
    ];
    const p = makeInitialParams(4);
    p.mu = 0.1; p.homeAdv = 0.25; p.rho = -0.05;
    p.att = [0.3, -0.1, 0.05, -0.25]; p.def = [-0.2, 0.1, 0.2, -0.1];
    const analytic = gradientNational(p, matches, 0.002, 1);
    const fd = fdGradient(p, matches, 0.002, 1);
    expect(Math.abs(analytic.dHomeAdv - fd.dHomeAdv)).toBeLessThan(1e-4);
  });

  it('all-neutral matches → analytic dHomeAdv == 0', () => {
    const matches: FitMatchNational[] = [
      { homeIdx: 0, awayIdx: 1, homeGoals: 2, awayGoals: 1, daysBeforeFit: 10, isNeutral: true },
      { homeIdx: 1, awayIdx: 0, homeGoals: 0, awayGoals: 1, daysBeforeFit: 5,  isNeutral: true },
    ];
    const p = makeInitialParams(2);
    p.homeAdv = 0.2;
    const g = gradientNational(p, matches, 0, 1);
    expect(g.dHomeAdv).toBe(0);
  });

  it('all-non-neutral matches → analytic dHomeAdv matches the EPL gradient formula', () => {
    // When every match is non-neutral, the homeAdv gradient should be
    // identical to the EPL Phase 8B form: Σ w · dLL/dλᴴ · λᴴ. Verify by
    // FD again (separate from the mixed case) for a single-fixture corpus.
    const matches: FitMatchNational[] = [
      { homeIdx: 0, awayIdx: 1, homeGoals: 2, awayGoals: 1, daysBeforeFit: 0, isNeutral: false },
    ];
    const p = makeInitialParams(2);
    p.mu = 0; p.homeAdv = 0.2;
    const analytic = gradientNational(p, matches, 0, 0);
    const fd = fdGradient(p, matches, 0, 0);
    expect(Math.abs(analytic.dHomeAdv - fd.dHomeAdv)).toBeLessThan(1e-5);
  });
});

// =============================================================================
// Convergence + recenter — reuse of Phase 8B invariants in the national fit.
// =============================================================================

describe('fitDixonColesNational', () => {
  it('produces a non-decreasing objective trajectory', () => {
    const matches: FitMatchNational[] = [
      { homeIdx: 0, awayIdx: 1, homeGoals: 2, awayGoals: 1, daysBeforeFit: 30, isNeutral: false },
      { homeIdx: 1, awayIdx: 2, homeGoals: 1, awayGoals: 1, daysBeforeFit: 20, isNeutral: false },
      { homeIdx: 2, awayIdx: 3, homeGoals: 0, awayGoals: 1, daysBeforeFit: 15, isNeutral: true },
      { homeIdx: 3, awayIdx: 0, homeGoals: 1, awayGoals: 2, daysBeforeFit: 10, isNeutral: false },
    ];
    const r = fitDixonColesNational(matches, 4, { xi: 0.002, lambdaReg: 1 });
    for (let i = 1; i < r.objectives.length; i += 1) {
      expect(r.objectives[i]).toBeGreaterThanOrEqual(r.objectives[i - 1] - 1e-12);
    }
  });

  it('re-centres α and δ to mean 0', () => {
    const matches: FitMatchNational[] = [
      { homeIdx: 0, awayIdx: 1, homeGoals: 2, awayGoals: 1, daysBeforeFit: 0, isNeutral: false },
      { homeIdx: 1, awayIdx: 0, homeGoals: 0, awayGoals: 1, daysBeforeFit: 0, isNeutral: false },
    ];
    const r = fitDixonColesNational(matches, 2, { xi: 0, lambdaReg: 1 });
    const meanAtt = r.params.att.reduce((a, b) => a + b, 0) / r.params.att.length;
    const meanDef = r.params.def.reduce((a, b) => a + b, 0) / r.params.def.length;
    expect(Math.abs(meanAtt)).toBeLessThan(1e-8);
    expect(Math.abs(meanDef)).toBeLessThan(1e-8);
  });
});

// =============================================================================
// Decay half-life arithmetic
// =============================================================================

describe('decay half-life', () => {
  it.each(
    [
      [0.0005, 1386],
      [0.0009, 770],
      [0.0013, 533],
      [0.0019, 365],
    ] as const,
  )('ξ=%f → half-life ≈ %d days', (xi, expected) => {
    const hl = Math.log(2) / xi;
    expect(Math.round(hl)).toBe(expected);
  });
});

// =============================================================================
// Score matrix builds a valid grid (sum to 1) under a range of params.
// =============================================================================

describe('scoreMatrixNational — grid integrity', () => {
  it('every cell is non-negative and the grid sums to 1', () => {
    const p = makeInitialParams(2);
    p.mu = 0.1; p.homeAdv = 0.25; p.rho = -0.1;
    p.att = [0.4, -0.4]; p.def = [-0.2, 0.2];
    const grid = scoreMatrixNational(p, 0, 1, false);
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
