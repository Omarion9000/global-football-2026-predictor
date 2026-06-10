// Pure helpers for the engine.
//
// UI components MAY import display-safe helpers from this module (date and
// locale formatting once they exist), but MUST NOT import RNG, Poisson, or
// other engine-math helpers from here. See docs/06_CLAUDE_CODE_RULES.md §0.

export { smoke } from './smoke';
export type { RNG } from './rng';
export { makeRNG } from './rng';
export {
  clamp,
  mean,
  normalize,
  roundProbability,
  safeDivide,
  sum,
  variance,
} from './math';
export { factorial, poissonPmf, poissonSample } from './poisson';
