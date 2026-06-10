// The single seeded RNG used everywhere in the engine. Same seed produces an
// identical sequence on every invocation. Implementation: Mulberry32, a small
// well-tested 32-bit PRNG with good statistical properties for our use case.
//
// Engine code MUST NOT use Math.random(). All randomness flows through here.

export type RNG = () => number;

export function makeRNG(seed: number): RNG {
  if (!Number.isFinite(seed)) {
    throw new Error('makeRNG: seed must be a finite number');
  }
  let state = (seed | 0) >>> 0;
  return function rng(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
