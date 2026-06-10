import type { TeamStats } from '@/lib/types';
import { clamp, normalize } from '@/lib/utils';
import {
  GOALS_PER_GAME_NORMALIZATION_MAX,
  RATING_NORMALIZATION,
  TEAM_STRENGTH_WEIGHTS,
} from './version';

export type TeamStrengthBreakdown = {
  rating: number;
  form: number;
  attack: number;
  defence: number;
  availability: number;
  /** Weighted composite in [0, 1]. */
  composite: number;
};

/**
 * Compute the composite team-strength breakdown per docs/03 §3.3.
 * Each component is normalised into [0, 1] before being weighted.
 *
 * The composite is explainable and used by the confidence calculation; it is
 * NOT a probability and is not consumed directly by the Poisson model.
 */
export function calculateTeamStrength(
  stats: TeamStats,
  availabilityScore = 1.0,
): TeamStrengthBreakdown {
  const ratingN = normalize(
    stats.rating,
    RATING_NORMALIZATION.min,
    RATING_NORMALIZATION.max,
  );
  // points-per-game is in [0, 3] (win = 3 pts)
  const formN = normalize(stats.pointsPerGame, 0, 3);
  const attackN = normalize(stats.goalsForPerGame, 0, GOALS_PER_GAME_NORMALIZATION_MAX);
  // higher goalsAgainstPerGame => weaker defence, so invert
  const defenceN =
    1 - normalize(stats.goalsAgainstPerGame, 0, GOALS_PER_GAME_NORMALIZATION_MAX);
  const availabilityN = clamp(availabilityScore, 0, 1);

  const w = TEAM_STRENGTH_WEIGHTS;
  const composite = clamp(
    w.rating * ratingN +
      w.form * formN +
      w.attack * attackN +
      w.defence * defenceN +
      w.availability * availabilityN,
    0,
    1,
  );

  return {
    rating: ratingN,
    form: formN,
    attack: attackN,
    defence: defenceN,
    availability: availabilityN,
    composite,
  };
}
