import { describe, expect, it } from 'vitest';
import { makeRNG } from '../rng';

describe('makeRNG', () => {
  it('produces values in [0, 1) on first draw', () => {
    const rng = makeRNG(1);
    const v = rng();
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
  });

  it('is deterministic for the same seed', () => {
    const a = makeRNG(42);
    const b = makeRNG(42);
    const seqA = Array.from({ length: 100 }, () => a());
    const seqB = Array.from({ length: 100 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = makeRNG(1);
    const b = makeRNG(2);
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });

  it('throws on non-finite seed', () => {
    expect(() => makeRNG(NaN)).toThrow();
    expect(() => makeRNG(Infinity)).toThrow();
  });

  it('mean of many draws is approximately 0.5', () => {
    const rng = makeRNG(12345);
    let s = 0;
    const n = 10_000;
    for (let i = 0; i < n; i++) s += rng();
    expect(s / n).toBeCloseTo(0.5, 1);
  });
});
