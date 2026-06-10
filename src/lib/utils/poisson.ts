import type { RNG } from './rng';

// Factorial for small non-negative integers. The engine only ever uses small
// k (<= POISSON_MAX_GOALS in version.ts), so an iterative implementation is
// both correct and fast. For k > 170 the result overflows to Infinity.
export function factorial(n: number): number {
  if (!Number.isInteger(n) || n < 0) {
    throw new Error('factorial: argument must be a non-negative integer');
  }
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

// P(X = k) for X ~ Poisson(lambda).
//   = exp(-lambda) * lambda^k / k!
export function poissonPmf(lambda: number, k: number): number {
  if (lambda < 0 || !Number.isFinite(lambda)) {
    throw new Error('poissonPmf: lambda must be a non-negative finite number');
  }
  if (!Number.isInteger(k) || k < 0) {
    throw new Error('poissonPmf: k must be a non-negative integer');
  }
  if (lambda === 0) return k === 0 ? 1 : 0;
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / factorial(k);
}

// Draw a single sample from Poisson(lambda) using Knuth's inversion algorithm.
// Uses the supplied seeded RNG — no Math.random() anywhere.
export function poissonSample(rng: RNG, lambda: number): number {
  if (lambda < 0 || !Number.isFinite(lambda)) {
    throw new Error('poissonSample: lambda must be a non-negative finite number');
  }
  if (lambda === 0) return 0;
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  // Loop bound prevents unbounded execution on pathological RNGs.
  for (let i = 0; i < 1000; i++) {
    k++;
    p *= rng();
    if (p <= L) return k - 1;
  }
  return k - 1;
}
