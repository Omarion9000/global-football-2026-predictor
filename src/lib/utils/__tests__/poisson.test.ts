import { describe, expect, it } from 'vitest';
import { factorial, poissonPmf, poissonSample } from '../poisson';
import { makeRNG } from '../rng';

describe('factorial', () => {
  it('handles small values', () => {
    expect(factorial(0)).toBe(1);
    expect(factorial(1)).toBe(1);
    expect(factorial(5)).toBe(120);
  });
  it('rejects negatives and non-integers', () => {
    expect(() => factorial(-1)).toThrow();
    expect(() => factorial(1.5)).toThrow();
  });
});

describe('poissonPmf', () => {
  it('sums to approximately 1 across reasonable k for several lambdas', () => {
    for (const lambda of [0.5, 1.0, 1.5, 2.5, 3.5]) {
      let s = 0;
      for (let k = 0; k <= 20; k++) s += poissonPmf(lambda, k);
      expect(s).toBeCloseTo(1, 4);
    }
  });

  it('values are non-negative', () => {
    for (let k = 0; k <= 20; k++) {
      expect(poissonPmf(1.5, k)).toBeGreaterThanOrEqual(0);
    }
  });

  it('mode shifts toward higher k as lambda increases', () => {
    const argmax = (lambda: number): number => {
      let best = 0;
      let bestP = -1;
      for (let k = 0; k <= 20; k++) {
        const p = poissonPmf(lambda, k);
        if (p > bestP) { bestP = p; best = k; }
      }
      return best;
    };
    expect(argmax(0.5)).toBe(0);
    expect(argmax(2.0)).toBeGreaterThanOrEqual(1);
    expect(argmax(5.0)).toBeGreaterThanOrEqual(4);
  });

  it('handles lambda = 0', () => {
    expect(poissonPmf(0, 0)).toBe(1);
    expect(poissonPmf(0, 3)).toBe(0);
  });

  it('rejects negative lambda', () => {
    expect(() => poissonPmf(-1, 0)).toThrow();
  });
});

describe('poissonSample', () => {
  it('always returns a non-negative integer', () => {
    const rng = makeRNG(1);
    for (let i = 0; i < 1000; i++) {
      const v = poissonSample(rng, 1.5);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });

  it('sample mean approximates lambda', () => {
    for (const lambda of [0.5, 1.5, 3.0]) {
      const rng = makeRNG(42);
      let s = 0;
      const n = 5000;
      for (let i = 0; i < n; i++) s += poissonSample(rng, lambda);
      const empirical = s / n;
      expect(empirical).toBeCloseTo(lambda, 1);
    }
  });

  it('is deterministic for the same seed', () => {
    const a = makeRNG(99);
    const b = makeRNG(99);
    for (let i = 0; i < 200; i++) {
      expect(poissonSample(a, 2.0)).toBe(poissonSample(b, 2.0));
    }
  });
});
