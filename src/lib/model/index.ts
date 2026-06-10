export { MODEL_VERSION } from './version';
export { calculateTeamStrength, type TeamStrengthBreakdown } from './teamStrength';
export { calculateExpectedGoals, type ExpectedGoalsBreakdown } from './expectedGoals';
export {
  generateScorelineMatrix,
  marginalProbabilities,
  topScorelines,
  type ScorelineMarginals,
} from './scorelines';
export {
  calculateConfidenceBand,
  calculateConfidenceScore,
  deriveConfidenceComponents,
  type ConfidenceComponents,
} from './confidence';
export { predictMatch, type PredictMatchOptions } from './predict';
