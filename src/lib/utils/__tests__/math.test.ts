import { describe, expect, it } from 'vitest';
import {
  clamp,
  mean,
  normalize,
  roundProbability,
  safeDivide,
  sum,
  variance,
} from '../math';

describe('clamp', () => {
  it('passes through values inside the range', () => {
    expect(clamp(0.5, 0, 1)).toBe(0.5);
  });
  it('clamps to bounds', () => {
    expect(clamp(-1, 0, 1)).toBe(0);
    expect(clamp(2, 0, 1)).toBe(1);
  });
  it('throws when min > max', () => {
    expect(() => clamp(0, 1, 0)).toThrow();
  });
});

describe('safeDivide', () => {
  it('divides normally', () => {
    expect(safeDivide(10, 2, -1)).toBe(5);
  });
  it('returns the fallback on zero denominator', () => {
    expect(safeDivide(10, 0, -1)).toBe(-1);
  });
  it('returns the fallback on non-finite denominator', () => {
    expect(safeDivide(10, NaN, 0)).toBe(0);
  });
});

describe('normalize', () => {
  it('maps min to 0 and max to 1', () => {
    expect(normalize(0, 0, 10)).toBe(0);
    expect(normalize(10, 0, 10)).toBe(1);
  });
  it('clamps values outside the window', () => {
    expect(normalize(-5, 0, 10)).toBe(0);
    expect(normalize(20, 0, 10)).toBe(1);
  });
  it('returns 0.5 when min equals max', () => {
    expect(normalize(7, 5, 5)).toBe(0.5);
  });
});

describe('mean / variance / sum', () => {
  it('mean averages a non-empty array', () => {
    expect(mean([1, 2, 3])).toBe(2);
  });
  it('variance is zero for a constant array', () => {
    expect(variance([5, 5, 5])).toBe(0);
  });
  it('variance is positive for spread', () => {
    expect(variance([0, 4])).toBeGreaterThan(0);
  });
  it('sum is additive', () => {
    expect(sum([1, 2, 3, 4])).toBe(10);
  });
});

describe('roundProbability', () => {
  it('clamps inputs into [0, 1]', () => {
    expect(roundProbability(-0.1, 4)).toBe(0);
    expect(roundProbability(1.5, 4)).toBe(1);
  });
  it('rounds to the requested precision', () => {
    expect(roundProbability(0.123456, 2)).toBe(0.12);
    expect(roundProbability(0.123456, 4)).toBe(0.1235);
  });
});
