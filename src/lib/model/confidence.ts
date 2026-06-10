import type { ConfidenceBand, PredictionInput } from '@/lib/types';
import { clamp, variance } from '@/lib/utils';
import {
  CONFIDENCE_BAND_THRESHOLDS,
  CONFIDENCE_COEFFICIENTS,
} from './version';

export type ConfidenceComponents = {
  dataQualityScore: number;
  lineupUncertainty: number;
  volatilityScore: number;
  probabilityGap: number;
};

/**
 * Quality-of-information confidence for a prediction, per docs/03 §9.
 * Result is a scalar in [0, 1]. The score is NOT a calibration of the
 * probabilities themselves; it signals how well-supported the prediction is by
 * the available inputs.
 */
export function calculateConfidenceScore(
  components: ConfidenceComponents,
): number {
  const c = CONFIDENCE_COEFFICIENTS;
  const raw =
    c.baseConfidence +
    c.cData * components.dataQualityScore -
    c.cGap * components.probabilityGap +
    c.cGap * 0.5 - // counterweight so a 50/30/20 split isn't auto-penalised
    c.cLineup * components.lineupUncertainty -
    c.cVol * components.volatilityScore;
  return clamp(raw, 0, 1);
}

export function calculateConfidenceBand(score: number): ConfidenceBand {
  if (score < CONFIDENCE_BAND_THRESHOLDS.lowToMedium) return 'LOW';
  if (score < CONFIDENCE_BAND_THRESHOLDS.mediumToHigh) return 'MEDIUM';
  return 'HIGH';
}

/**
 * Derive each confidence component from a PredictionInput. Lives here so the
 * confidence math has a single typed entry point and predict.ts stays thin.
 */
export function deriveConfidenceComponents(
  input: PredictionInput,
  probabilityGap: number,
): ConfidenceComponents {
  // 3 binary signals: lineup, in-play, recent-form sample >= 5 for both sides
  const present =
    (input.lineupAvailable ? 1 : 0) +
    (input.inPlayAvailable ? 1 : 0) +
    (input.statsTeamA.recentMatches.length >= 5 &&
    input.statsTeamB.recentMatches.length >= 5
      ? 1
      : 0);
  const dataQualityScore = present / 3;

  // Lineup uncertainty per docs/03 §9:
  //  - 1.0 before T_MINUS_1H
  //  - 0.0 once lineups are known
  let lineupUncertainty: number;
  if (input.runType === 'T_MINUS_3H') {
    lineupUncertainty = 1.0;
  } else {
    lineupUncertainty = input.lineupAvailable ? 0.0 : 1.0;
  }

  // Volatility: form-variance per side + rest-day differential
  const gdSeriesA = input.statsTeamA.recentMatches.map(
    (m) => m.goalsFor - m.goalsAgainst,
  );
  const gdSeriesB = input.statsTeamB.recentMatches.map(
    (m) => m.goalsFor - m.goalsAgainst,
  );
  const formVarA = gdSeriesA.length > 0 ? variance(gdSeriesA) : 0;
  const formVarB = gdSeriesB.length > 0 ? variance(gdSeriesB) : 0;
  const restDiff =
    Math.abs(input.fixture.restDaysTeamA - input.fixture.restDaysTeamB) / 7;
  const volatilityScore = clamp((formVarA + formVarB) / 10 + restDiff, 0, 1);

  return {
    dataQualityScore,
    lineupUncertainty,
    volatilityScore,
    probabilityGap,
  };
}
