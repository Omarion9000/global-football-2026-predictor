// Frozen constants for the V1 statistical engine. Bumping MODEL_VERSION is the
// only legitimate way to change any of these values. In-place edits are
// forbidden once a version has produced stored predictions — see
// docs/03_MODEL_SPEC.md §11 and docs/06_CLAUDE_CODE_RULES.md §0.

export const MODEL_VERSION = 'v0.1.0' as const;

// --- Composite team-strength weights (docs/03 §3.3, sum to 1.00) ---
export const TEAM_STRENGTH_WEIGHTS = Object.freeze({
  rating: 0.45,
  form: 0.20,
  attack: 0.15,
  defence: 0.15,
  availability: 0.05,
});

// --- Normalization windows used to map raw inputs into [0, 1] ---
// Reference values that approximate an "average international team" so the
// engine produces ~base goals per side at the centre of the rating spread.
export const RATING_NORMALIZATION = Object.freeze({
  /** Below this rating maps to 0. */
  min: 1300,
  /** Above this rating maps to 1. */
  max: 2100,
});

export const GOALS_PER_GAME_NORMALIZATION_MAX = 3.0;

// --- Expected goals coefficients (docs/03 §4.2) ---
export const ATTACK_COEFFICIENTS = Object.freeze({
  /** Weight on the rating component. */
  alpha1: 0.6,
  /** Weight on the form (goals-for) component. */
  alpha2: 0.4,
});

export const DEFENCE_COEFFICIENTS = Object.freeze({
  /** Weight on the rating component. */
  beta1: 0.5,
  /** Weight on the form (goals-against, inverted) component. */
  beta2: 0.5,
  /** Small constant to avoid division by zero on goalsAgainstPerGame = 0. */
  epsilon: 0.1,
});

/** Base goals per side for two reference-average teams at a neutral venue. */
export const BASE_GOALS_PER_SIDE = 1.30;

/** Multiplicative bonus applied to the home-country side at host-nation venues. */
export const HOME_ADVANTAGE_FACTOR_HOST_NATION = 1.10;

// --- Context multipliers (docs/03 §4.2) ---
export const REST_DAYS_REFERENCE = 3;
export const REST_DAYS_SLOPE = 0.01;
export const REST_DAYS_MIN_MULTIPLIER = 0.92;
export const REST_DAYS_MAX_MULTIPLIER = 1.05;

export const ALTITUDE_REFERENCE_METERS = 1500;
export const ALTITUDE_SLOPE_PER_METER = 0.00004;
export const ALTITUDE_MIN_MULTIPLIER = 0.94;
export const ALTITUDE_MAX_MULTIPLIER = 1.00;

// --- Expected-goals safety clamps (docs/03 §4.2 final paragraph) ---
export const XG_MIN = 0.1;
export const XG_MAX = 5.0;

// --- Poisson scoreline matrix (docs/03 §5.1) ---
export const POISSON_MAX_GOALS = 6;
/** Dixon-Coles low-score correction parameter. Zero in v0.1.0 = pure
 *  independent Poisson. Calibrated against World Cup data in a later version. */
export const DIXON_COLES_RHO = 0;
export const TOP_N_SCORELINES = 5;

// --- Monte Carlo simulation (docs/03 §6) ---
export const MONTE_CARLO_ITERATIONS = 10_000;
/** If the simulator disagrees with the analytic marginals by more than this
 *  amount, the engine emits a warning (NOT a console log). Set to 1.5% rather
 *  than the docs/03 §6.3 nominal 0.5% to account for sampling noise at
 *  N = MONTE_CARLO_ITERATIONS — 0.5% is below 1 sigma at that N for typical p,
 *  which would warn on most healthy runs. See deviations note. */
export const MC_ANALYTIC_DISAGREEMENT_THRESHOLD = 0.015;

// --- Confidence score (docs/03 §9) ---
export const CONFIDENCE_COEFFICIENTS = Object.freeze({
  baseConfidence: 0.55,
  cData: 0.20,
  cGap: 0.15,
  cLineup: 0.20,
  cVol: 0.15,
});

export const CONFIDENCE_BAND_THRESHOLDS = Object.freeze({
  /** scores < lowToMedium are LOW */
  lowToMedium: 0.40,
  /** scores >= mediumToHigh are HIGH; in-between is MEDIUM */
  mediumToHigh: 0.70,
});

// --- Knockout extra-time / penalties priors (docs/03 §5.3) ---
export const ET_XG_SLOPE = 0.10; // kappa
export const PEN_RATING_SLOPE = 0.05; // xi
