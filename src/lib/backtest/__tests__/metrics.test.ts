import { describe, expect, it } from 'vitest';
import {
  calibrationBins,
  LOG_LOSS_EPS,
  logLoss,
  multiclassBrier,
  outcomeOneHot,
  argmaxOutcome,
} from '../metrics';

// =============================================================================
// Hand-computed Brier values. Worked examples + analytic identity.
// =============================================================================

describe('multiclassBrier — hand-computed', () => {
  it('returns 0 for a perfect prediction', () => {
    expect(multiclassBrier([1, 0, 0], 'H')).toBe(0);
    expect(multiclassBrier([0, 1, 0], 'D')).toBe(0);
    expect(multiclassBrier([0, 0, 1], 'A')).toBe(0);
  });

  it('returns 2 for a maximally confident wrong prediction', () => {
    // outcome 'H', predicted [0,0,1] → (0-1)² + 0 + (1-0)² = 2
    expect(multiclassBrier([0, 0, 1], 'H')).toBe(2);
  });

  it('returns exactly 2/3 for the uniform prediction (GATE 1 anchor)', () => {
    const u = 1 / 3;
    expect(multiclassBrier([u, u, u], 'H')).toBeCloseTo(2 / 3, 12);
    expect(multiclassBrier([u, u, u], 'D')).toBeCloseTo(2 / 3, 12);
    expect(multiclassBrier([u, u, u], 'A')).toBeCloseTo(2 / 3, 12);
  });

  it('matches the closed-form expansion for a known asymmetric example', () => {
    // outcome 'H', probs [0.6, 0.25, 0.15]
    // = (0.6-1)² + 0.25² + 0.15² = 0.16 + 0.0625 + 0.0225 = 0.245
    expect(multiclassBrier([0.6, 0.25, 0.15], 'H')).toBeCloseTo(0.245, 12);
  });
});

// =============================================================================
// Log loss — analytic identity + clamp.
// =============================================================================

describe('logLoss — hand-computed', () => {
  it('returns 0 for a perfect prediction (within the clamp)', () => {
    // p=1 → -log(1) = 0. The clamp at 1e-12 is below 1 so does not engage.
    expect(logLoss([1, 0, 0], 'H')).toBeCloseTo(0, 12);
  });

  it('returns ln(3) ≈ 1.09861 for the uniform prediction (GATE 1 anchor)', () => {
    const u = 1 / 3;
    expect(logLoss([u, u, u], 'H')).toBeCloseTo(Math.log(3), 12);
    expect(logLoss([u, u, u], 'D')).toBeCloseTo(Math.log(3), 12);
    expect(logLoss([u, u, u], 'A')).toBeCloseTo(Math.log(3), 12);
  });

  it('clamps a zero-probability surprise at -log(LOG_LOSS_EPS)', () => {
    // outcome 'H' but predicted 0 home probability. Without the clamp this
    // would diverge; with the clamp it is finite.
    const v = logLoss([0, 0.5, 0.5], 'H');
    expect(v).toBe(-Math.log(LOG_LOSS_EPS));
    expect(Number.isFinite(v)).toBe(true);
  });

  it('matches -ln(p) for a non-clamped value', () => {
    // p_H = 0.4, outcome 'H' → -ln(0.4)
    expect(logLoss([0.4, 0.35, 0.25], 'H')).toBeCloseTo(-Math.log(0.4), 12);
  });
});

// =============================================================================
// Argmax outcome — tie-break behaviour.
// =============================================================================

describe('argmaxOutcome', () => {
  it('returns the index-min tie-break on a uniform triple', () => {
    expect(argmaxOutcome([1 / 3, 1 / 3, 1 / 3])).toBe('H');
  });

  it('returns the strictly-larger class', () => {
    expect(argmaxOutcome([0.6, 0.25, 0.15])).toBe('H');
    expect(argmaxOutcome([0.2, 0.5, 0.3])).toBe('D');
    expect(argmaxOutcome([0.1, 0.2, 0.7])).toBe('A');
  });
});

// =============================================================================
// Invariant — probability triples must sum to 1.
// =============================================================================

describe('probability-triple invariant', () => {
  it('raises when the triple is non-finite', () => {
    expect(() => multiclassBrier([NaN, 0, 1], 'H')).toThrow(/finite/);
    expect(() => logLoss([NaN, 0, 1], 'H')).toThrow(/finite/);
  });

  it('raises when the triple is negative', () => {
    expect(() => multiclassBrier([-0.1, 0.6, 0.5], 'H')).toThrow(/non-negative/);
  });

  it('raises when the triple sums to ~0.95 (outside 1e-6 tolerance)', () => {
    expect(() => multiclassBrier([0.3, 0.3, 0.35], 'H')).toThrow(/sum to 1/);
  });

  it('accepts a triple within the 1e-6 tolerance', () => {
    // Sum is 1 - 5e-7 -> still within 1e-6.
    expect(() =>
      multiclassBrier([0.3 - 1e-7, 0.3 - 2e-7, 0.4 - 2e-7], 'H'),
    ).not.toThrow();
  });
});

// =============================================================================
// One-hot encoding.
// =============================================================================

describe('outcomeOneHot', () => {
  it('produces the canonical 1-of-3 vectors', () => {
    expect(outcomeOneHot('H')).toEqual([1, 0, 0]);
    expect(outcomeOneHot('D')).toEqual([0, 1, 0]);
    expect(outcomeOneHot('A')).toEqual([0, 0, 1]);
  });
});

// =============================================================================
// Calibration bins — bin edges, p=0 / p=1, empty bins.
// =============================================================================

describe('calibrationBins — bin edges', () => {
  it('puts p = 0 in the first bin', () => {
    const out = calibrationBins([{ p: 0, hit: false }], 10);
    expect(out[0].count).toBe(1);
    expect(out[0].meanPredicted).toBe(0);
    expect(out[0].empiricalRate).toBe(0);
    for (let i = 1; i < 10; i += 1) expect(out[i].count).toBe(0);
  });

  it('puts p = 1 in the LAST bin (right-inclusive edge case)', () => {
    const out = calibrationBins([{ p: 1, hit: true }], 10);
    expect(out[9].count).toBe(1);
    expect(out[9].meanPredicted).toBe(1);
    expect(out[9].empiricalRate).toBe(1);
    for (let i = 0; i < 9; i += 1) expect(out[i].count).toBe(0);
  });

  it('treats p = 0.1 as the bin-1 lower edge (not bin 0)', () => {
    const out = calibrationBins([{ p: 0.1, hit: false }], 10);
    expect(out[0].count).toBe(0);
    expect(out[1].count).toBe(1);
  });

  it('emits empty bins as { meanPredicted: 0, empiricalRate: 0, count: 0 }', () => {
    const out = calibrationBins([{ p: 0.55, hit: true }], 10);
    for (let i = 0; i < 10; i += 1) {
      if (i === 5) continue;
      expect(out[i]).toEqual({ meanPredicted: 0, empiricalRate: 0, count: 0 });
    }
    expect(out[5].count).toBe(1);
    expect(out[5].meanPredicted).toBeCloseTo(0.55, 12);
    expect(out[5].empiricalRate).toBe(1);
  });
});

describe('calibrationBins — averaging', () => {
  it('averages multiple predictions in a single bin', () => {
    const out = calibrationBins(
      [
        { p: 0.5, hit: true },
        { p: 0.55, hit: false },
        { p: 0.59, hit: true },
      ],
      10,
    );
    expect(out[5].count).toBe(3);
    expect(out[5].meanPredicted).toBeCloseTo((0.5 + 0.55 + 0.59) / 3, 12);
    expect(out[5].empiricalRate).toBeCloseTo(2 / 3, 12);
  });

  it('raises on out-of-range probabilities', () => {
    expect(() => calibrationBins([{ p: 1.01, hit: true }], 10)).toThrow(/in \[0,1\]/);
    expect(() => calibrationBins([{ p: -0.01, hit: false }], 10)).toThrow(/in \[0,1\]/);
  });

  it('raises on non-integer or non-positive bin counts', () => {
    expect(() => calibrationBins([], 0)).toThrow(/positive integer/);
    expect(() => calibrationBins([], 10.5)).toThrow(/positive integer/);
  });
});
