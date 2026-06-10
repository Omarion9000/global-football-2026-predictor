import type { PredictionInput, TeamStats } from '@/lib/types';
import { clamp, normalize, safeDivide } from '@/lib/utils';
import {
  ALTITUDE_MAX_MULTIPLIER,
  ALTITUDE_MIN_MULTIPLIER,
  ALTITUDE_REFERENCE_METERS,
  ALTITUDE_SLOPE_PER_METER,
  ATTACK_COEFFICIENTS,
  BASE_GOALS_PER_SIDE,
  DEFENCE_COEFFICIENTS,
  GOALS_PER_GAME_NORMALIZATION_MAX,
  HOME_ADVANTAGE_FACTOR_HOST_NATION,
  RATING_NORMALIZATION,
  REST_DAYS_MAX_MULTIPLIER,
  REST_DAYS_MIN_MULTIPLIER,
  REST_DAYS_REFERENCE,
  REST_DAYS_SLOPE,
  XG_MAX,
  XG_MIN,
} from './version';

export type ExpectedGoalsBreakdown = {
  xgA: number;
  xgB: number;
  attackA: number;
  attackB: number;
  defenceA: number;
  defenceB: number;
  hostMultiplierA: number;
  hostMultiplierB: number;
  contextMultiplierA: number;
  contextMultiplierB: number;
};

function attackFactor(stats: TeamStats): number {
  const ratingN = normalize(
    stats.rating,
    RATING_NORMALIZATION.min,
    RATING_NORMALIZATION.max,
  );
  const goalsN = normalize(
    stats.goalsForPerGame,
    0,
    GOALS_PER_GAME_NORMALIZATION_MAX,
  );
  return (
    ATTACK_COEFFICIENTS.alpha1 * ratingN + ATTACK_COEFFICIENTS.alpha2 * goalsN
  );
}

function defenceFactor(stats: TeamStats): number {
  const ratingN = normalize(
    stats.rating,
    RATING_NORMALIZATION.min,
    RATING_NORMALIZATION.max,
  );
  // Invert goalsAgainstPerGame: lower is better.
  const defendN =
    1 -
    normalize(
      stats.goalsAgainstPerGame,
      0,
      GOALS_PER_GAME_NORMALIZATION_MAX,
    );
  return (
    DEFENCE_COEFFICIENTS.beta1 * ratingN + DEFENCE_COEFFICIENTS.beta2 * defendN
  );
}

function restMultiplier(restDays: number): number {
  return clamp(
    0.95 + REST_DAYS_SLOPE * (restDays - REST_DAYS_REFERENCE),
    REST_DAYS_MIN_MULTIPLIER,
    REST_DAYS_MAX_MULTIPLIER,
  );
}

function altitudeMultiplier(meters: number): number {
  return clamp(
    1.0 - ALTITUDE_SLOPE_PER_METER * Math.max(0, meters - ALTITUDE_REFERENCE_METERS),
    ALTITUDE_MIN_MULTIPLIER,
    ALTITUDE_MAX_MULTIPLIER,
  );
}

/**
 * Compute the match-level expected goals for both teams per docs/03 §4.2.
 *
 * The formula:
 *   xgA = base * (attack(A) / defence(B)) * hostMultA * contextMultA
 *
 * Both outputs are clamped to [XG_MIN, XG_MAX] to keep the downstream Poisson
 * matrix well-behaved on pathological inputs.
 */
export function calculateExpectedGoals(
  input: PredictionInput,
): ExpectedGoalsBreakdown {
  const attackA = attackFactor(input.statsTeamA);
  const attackB = attackFactor(input.statsTeamB);
  const defenceA = defenceFactor(input.statsTeamA);
  const defenceB = defenceFactor(input.statsTeamB);

  const hostMultiplierA = input.fixture.isHomeForTeamA
    ? HOME_ADVANTAGE_FACTOR_HOST_NATION
    : 1.0;
  const hostMultiplierB = input.fixture.isHomeForTeamB
    ? HOME_ADVANTAGE_FACTOR_HOST_NATION
    : 1.0;

  const altMult = altitudeMultiplier(input.fixture.altitudeMeters);
  const contextMultiplierA =
    restMultiplier(input.fixture.restDaysTeamA) * altMult;
  const contextMultiplierB =
    restMultiplier(input.fixture.restDaysTeamB) * altMult;

  // Guard against pathological zero-defence by falling back to a tiny defence
  // value via safeDivide. With the formulas above defence is bounded below by
  // beta2 * 0 + beta1 * 0 = 0; in practice it stays > 0 because rating is
  // normalised into [0, 1] and any real team has a non-zero defence component.
  const rawXgA =
    BASE_GOALS_PER_SIDE *
    safeDivide(attackA, defenceB + DEFENCE_COEFFICIENTS.epsilon, attackA) *
    hostMultiplierA *
    contextMultiplierA;
  const rawXgB =
    BASE_GOALS_PER_SIDE *
    safeDivide(attackB, defenceA + DEFENCE_COEFFICIENTS.epsilon, attackB) *
    hostMultiplierB *
    contextMultiplierB;

  return {
    xgA: clamp(rawXgA, XG_MIN, XG_MAX),
    xgB: clamp(rawXgB, XG_MIN, XG_MAX),
    attackA,
    attackB,
    defenceA,
    defenceB,
    hostMultiplierA,
    hostMultiplierB,
    contextMultiplierA,
    contextMultiplierB,
  };
}
