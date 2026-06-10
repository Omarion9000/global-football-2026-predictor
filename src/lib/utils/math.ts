// Pure numeric helpers shared by the engine. No I/O.

export function clamp(value: number, min: number, max: number): number {
  if (min > max) throw new Error('clamp: min must be <= max');
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function safeDivide(
  numerator: number,
  denominator: number,
  fallback: number,
): number {
  if (denominator === 0 || !Number.isFinite(denominator)) return fallback;
  const result = numerator / denominator;
  return Number.isFinite(result) ? result : fallback;
}

// Linear normalization into [0, 1]. Values outside [min, max] are clamped.
export function normalize(value: number, min: number, max: number): number {
  if (min === max) return 0.5;
  return clamp((value - min) / (max - min), 0, 1);
}

// Sample mean for a non-empty array.
export function mean(values: readonly number[]): number {
  if (values.length === 0) throw new Error('mean: empty input');
  let s = 0;
  for (const v of values) s += v;
  return s / values.length;
}

// Population variance for a non-empty array.
export function variance(values: readonly number[]): number {
  if (values.length === 0) throw new Error('variance: empty input');
  const m = mean(values);
  let s = 0;
  for (const v of values) s += (v - m) * (v - m);
  return s / values.length;
}

// Rounds a probability for display. Engine internals never round; only
// presentation-layer callers should.
export function roundProbability(p: number, decimals = 4): number {
  if (!Number.isFinite(p)) return 0;
  const factor = Math.pow(10, decimals);
  return Math.round(clamp(p, 0, 1) * factor) / factor;
}

export function sum(values: readonly number[]): number {
  let s = 0;
  for (const v of values) s += v;
  return s;
}
