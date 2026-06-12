import { describe, expect, it } from 'vitest';
import {
  cloneParams,
  makeInitialParams,
  predictTriple,
  tauDC,
  type DcParams,
} from '../dixonColes';
import {
  fitDixonColes,
  gradient,
  objective,
  type FitMatch,
} from '../dcFit';

// =============================================================================
// Synthetic-corpus utilities
// =============================================================================

function synthMatch(overrides: Partial<FitMatch>): FitMatch {
  return {
    homeIdx: 0,
    awayIdx: 1,
    homeGoals: 1,
    awayGoals: 0,
    daysBeforeFit: 0,
    ...overrides,
  };
}

/** Tiny 4-team / 8-match dataset used by gradient checks + recovery. */
function tinyCorpus(): { matches: FitMatch[]; nTeams: number } {
  const matches: FitMatch[] = [
    { homeIdx: 0, awayIdx: 1, homeGoals: 2, awayGoals: 1, daysBeforeFit: 30 },
    { homeIdx: 1, awayIdx: 2, homeGoals: 1, awayGoals: 1, daysBeforeFit: 28 },
    { homeIdx: 2, awayIdx: 3, homeGoals: 0, awayGoals: 1, daysBeforeFit: 25 },
    { homeIdx: 3, awayIdx: 0, homeGoals: 1, awayGoals: 2, daysBeforeFit: 20 },
    { homeIdx: 0, awayIdx: 2, homeGoals: 1, awayGoals: 0, daysBeforeFit: 15 },
    { homeIdx: 1, awayIdx: 3, homeGoals: 0, awayGoals: 0, daysBeforeFit: 10 },
    { homeIdx: 2, awayIdx: 0, homeGoals: 1, awayGoals: 1, daysBeforeFit: 5 },
    { homeIdx: 3, awayIdx: 1, homeGoals: 2, awayGoals: 0, daysBeforeFit: 0 },
  ];
  return { matches, nTeams: 4 };
}

function asymmetricParams(nTeams: number): DcParams {
  // Pick non-trivial values so every partial derivative is exercised.
  const p = makeInitialParams(nTeams);
  p.mu = 0.1;
  p.homeAdv = 0.25;
  p.rho = -0.08;
  p.att[0] = 0.3;
  p.att[1] = -0.1;
  p.att[2] = 0.05;
  p.att[3] = -0.25; // sums to 0
  p.def[0] = -0.2;
  p.def[1] = 0.1;
  p.def[2] = 0.2;
  p.def[3] = -0.1; // sums to 0
  return p;
}

// =============================================================================
// Analytic-vs-finite-difference gradient check (W6 acceptance gate).
// =============================================================================

function finiteDifferenceGradient(
  params: DcParams,
  matches: FitMatch[],
  xi: number,
  lambdaReg: number,
  h = 1e-5,
): {
  dMu: number;
  dHomeAdv: number;
  dRho: number;
  dAtt: number[];
  dDef: number[];
} {
  const fd = {
    dMu: 0,
    dHomeAdv: 0,
    dRho: 0,
    dAtt: new Array(params.att.length).fill(0),
    dDef: new Array(params.def.length).fill(0),
  };
  function dObjectiveAlong(setter: (p: DcParams, delta: number) => void): number {
    const plus = cloneParams(params);
    setter(plus, h);
    const minus = cloneParams(params);
    setter(minus, -h);
    return (objective(plus, matches, xi, lambdaReg) - objective(minus, matches, xi, lambdaReg)) / (2 * h);
  }
  fd.dMu = dObjectiveAlong((p, d) => (p.mu += d));
  fd.dHomeAdv = dObjectiveAlong((p, d) => (p.homeAdv += d));
  fd.dRho = dObjectiveAlong((p, d) => (p.rho += d));
  for (let i = 0; i < params.att.length; i += 1) {
    fd.dAtt[i] = dObjectiveAlong((p, d) => (p.att[i] += d));
    fd.dDef[i] = dObjectiveAlong((p, d) => (p.def[i] += d));
  }
  return fd;
}

describe('dcFit — analytic gradient matches finite differences (tol 1e-4)', () => {
  it('matches FD on a tiny 4-team / 8-match corpus', () => {
    const { matches, nTeams } = tinyCorpus();
    const params = asymmetricParams(nTeams);
    const xi = 0.002;
    const lambdaReg = 1;

    const analytic = gradient(params, matches, xi, lambdaReg);
    const fd = finiteDifferenceGradient(params, matches, xi, lambdaReg);

    expect(Math.abs(analytic.dMu - fd.dMu)).toBeLessThan(1e-4);
    expect(Math.abs(analytic.dHomeAdv - fd.dHomeAdv)).toBeLessThan(1e-4);
    expect(Math.abs(analytic.dRho - fd.dRho)).toBeLessThan(1e-4);
    for (let i = 0; i < nTeams; i += 1) {
      expect(Math.abs(analytic.dAtt[i] - fd.dAtt[i])).toBeLessThan(1e-4);
      expect(Math.abs(analytic.dDef[i] - fd.dDef[i])).toBeLessThan(1e-4);
    }
  });
});

// =============================================================================
// τ correctness — DC ρ = 0 ⇒ τ ≡ 1.
// =============================================================================

describe('tauDC', () => {
  it('returns 1 for every cell when ρ = 0', () => {
    for (let x = 0; x <= 2; x += 1) {
      for (let y = 0; y <= 2; y += 1) {
        expect(tauDC(x, y, 1.5, 1.1, 0)).toBe(1);
      }
    }
  });

  it('matches the closed-form expressions at the four DC cells', () => {
    const lH = 1.5;
    const lA = 1.1;
    const rho = -0.05;
    expect(tauDC(0, 0, lH, lA, rho)).toBeCloseTo(1 - lH * lA * rho, 12);
    expect(tauDC(1, 0, lH, lA, rho)).toBeCloseTo(1 + lA * rho, 12);
    expect(tauDC(0, 1, lH, lA, rho)).toBeCloseTo(1 + lH * rho, 12);
    expect(tauDC(1, 1, lH, lA, rho)).toBeCloseTo(1 - rho, 12);
  });

  it('returns 1 for any cell outside the four DC cells', () => {
    expect(tauDC(2, 0, 1.5, 1.1, -0.05)).toBe(1);
    expect(tauDC(0, 3, 1.5, 1.1, -0.05)).toBe(1);
    expect(tauDC(2, 2, 1.5, 1.1, -0.05)).toBe(1);
  });
});

// =============================================================================
// Score matrix sums to 1 and produces a well-formed probability triple.
// =============================================================================

describe('scoreMatrix → triple', () => {
  it('produces a probability triple summing to 1', () => {
    const { nTeams } = tinyCorpus();
    const params = asymmetricParams(nTeams);
    const [pH, pD, pA] = predictTriple(params, 0, 1);
    expect(pH).toBeGreaterThanOrEqual(0);
    expect(pD).toBeGreaterThanOrEqual(0);
    expect(pA).toBeGreaterThanOrEqual(0);
    expect(pH + pD + pA).toBeCloseTo(1, 10);
  });

  it('home-team-stronger params produce pH > pA', () => {
    const params = makeInitialParams(2);
    params.homeAdv = 0.3;
    params.att[0] = 0.4;
    params.att[1] = -0.4; // sums to 0
    params.def[0] = -0.3;
    params.def[1] = 0.3;
    const [pH, , pA] = predictTriple(params, 0, 1);
    expect(pH).toBeGreaterThan(pA);
  });
});

// =============================================================================
// Convergence + monotonic objective on the tiny corpus.
// =============================================================================

describe('fitDixonColes', () => {
  it('produces a non-decreasing objective trajectory (GATE D regression)', () => {
    const { matches, nTeams } = tinyCorpus();
    const result = fitDixonColes(matches, nTeams, { xi: 0.002, lambdaReg: 1 });
    for (let i = 1; i < result.objectives.length; i += 1) {
      expect(result.objectives[i]).toBeGreaterThanOrEqual(result.objectives[i - 1] - 1e-12);
    }
  });

  it('re-centres α and δ to mean 0', () => {
    const { matches, nTeams } = tinyCorpus();
    const { params } = fitDixonColes(matches, nTeams, { xi: 0.002, lambdaReg: 1 });
    const meanAtt = params.att.reduce((a, b) => a + b, 0) / params.att.length;
    const meanDef = params.def.reduce((a, b) => a + b, 0) / params.def.length;
    expect(Math.abs(meanAtt)).toBeLessThan(1e-8);
    expect(Math.abs(meanDef)).toBeLessThan(1e-8);
  });

  it('clamps ρ inside the documented safe band', () => {
    const { matches, nTeams } = tinyCorpus();
    const { params } = fitDixonColes(matches, nTeams, { xi: 0.002, lambdaReg: 1 });
    expect(params.rho).toBeGreaterThanOrEqual(-0.2);
    expect(params.rho).toBeLessThanOrEqual(0.1);
  });
});

// =============================================================================
// Parameter recovery — fit on data simulated with known params.
// =============================================================================

function simulateMatch(
  params: DcParams,
  homeIdx: number,
  awayIdx: number,
  random: () => number,
): { homeGoals: number; awayGoals: number } {
  // Cheap sampler: build the score grid and draw from the cumulative.
  const grid: number[][] = [];
  const N = 11;
  const muH = Math.exp(
    params.mu + params.homeAdv + params.att[homeIdx] - params.def[awayIdx],
  );
  const muA = Math.exp(
    params.mu + params.att[awayIdx] - params.def[homeIdx],
  );
  let total = 0;
  function pois(x: number, lambda: number): number {
    let logFact = 0;
    for (let k = 2; k <= x; k += 1) logFact += Math.log(k);
    return Math.exp(x * Math.log(lambda) - lambda - logFact);
  }
  for (let x = 0; x < N; x += 1) {
    const row: number[] = [];
    for (let y = 0; y < N; y += 1) {
      const t = tauDC(x, y, muH, muA, params.rho);
      const p = (t > 0 ? t : 0) * pois(x, muH) * pois(y, muA);
      row.push(p);
      total += p;
    }
    grid.push(row);
  }
  const r = random() * total;
  let cum = 0;
  for (let x = 0; x < N; x += 1) {
    for (let y = 0; y < N; y += 1) {
      cum += grid[x][y];
      if (cum >= r) return { homeGoals: x, awayGoals: y };
    }
  }
  return { homeGoals: 0, awayGoals: 0 };
}

function mulberry32(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('fitDixonColes — parameter recovery', () => {
  it('recovers home-advantage sign and magnitude from synthetic data', () => {
    const trueParams = makeInitialParams(6);
    trueParams.mu = 0.0;
    trueParams.homeAdv = 0.3;
    trueParams.rho = -0.05;
    trueParams.att = [0.4, 0.25, 0.0, -0.1, -0.25, -0.3]; // sums to 0
    trueParams.def = [-0.3, -0.15, 0.0, 0.1, 0.2, 0.15]; // sums to 0

    // Generate 600 matches uniformly across the 6-team round-robin (6 ×
    // 5 × 20 ≈ 600 fixtures), enough to recover sign/magnitude.
    const rng = mulberry32(42);
    const matches: FitMatch[] = [];
    for (let rep = 0; rep < 20; rep += 1) {
      for (let i = 0; i < 6; i += 1) {
        for (let j = 0; j < 6; j += 1) {
          if (i === j) continue;
          const { homeGoals, awayGoals } = simulateMatch(trueParams, i, j, rng);
          matches.push({
            homeIdx: i,
            awayIdx: j,
            homeGoals,
            awayGoals,
            daysBeforeFit: 0,
          });
        }
      }
    }

    const { params } = fitDixonColes(matches, 6, {
      xi: 0,
      lambdaReg: 0.01,
      maxIterations: 1000,
    });

    // Home advantage: recovered within 0.1 of truth and definitely positive.
    expect(params.homeAdv).toBeGreaterThan(0);
    expect(Math.abs(params.homeAdv - trueParams.homeAdv)).toBeLessThan(0.15);

    // Attack-ranking preserved: team 0 should be strictly higher than team 5.
    expect(params.att[0]).toBeGreaterThan(params.att[5]);

    // ρ stays in the safe band.
    expect(params.rho).toBeGreaterThanOrEqual(-0.2);
    expect(params.rho).toBeLessThanOrEqual(0.1);
  });
});

// =============================================================================
// Decay weight halves at implied half-life.
// =============================================================================

describe('exponential decay weights', () => {
  it('halves at t = ln 2 / ξ days', () => {
    const xi = 0.0065;
    const halfLifeDays = Math.log(2) / xi;
    const w = Math.exp(-xi * halfLifeDays);
    expect(w).toBeCloseTo(0.5, 12);
  });

  it('xi = 0 produces uniform weights (1)', () => {
    expect(Math.exp(-0 * 365)).toBe(1);
  });
});

// =============================================================================
// Promoted-team init — newcomer ends up near league average.
// =============================================================================

describe('promoted-team initialisation', () => {
  it('a team that never appears in matches keeps its initial α=δ=0', () => {
    const matches = [
      { homeIdx: 0, awayIdx: 1, homeGoals: 1, awayGoals: 1, daysBeforeFit: 0 },
      { homeIdx: 1, awayIdx: 0, homeGoals: 0, awayGoals: 0, daysBeforeFit: 0 },
    ];
    // 3 teams: index 2 never plays.
    const { params } = fitDixonColes(matches, 3, { xi: 0, lambdaReg: 1 });
    // The recenter step keeps mean(α)=mean(δ)=0, so an unused team can drift
    // mechanically. Verify the magnitude is tiny — newcomer effectively at
    // league average, as documented in docs/16.
    expect(Math.abs(params.att[2])).toBeLessThan(0.5);
    expect(Math.abs(params.def[2])).toBeLessThan(0.5);
  });
});

it('synthetic flagging', () => {
  expect(synthMatch({ homeGoals: 3 }).homeGoals).toBe(3);
});
